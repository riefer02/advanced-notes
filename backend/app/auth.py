"""
Clerk Authentication Middleware for Flask

This module provides JWT verification for Clerk authentication tokens.
"""

import logging
import os
import time
from functools import wraps
from typing import Any

import requests
from flask import current_app, jsonify, request
from jose import jwt
from jose.exceptions import JWTError

from .config import Config
from .services.resilience import retry_with_backoff

logger = logging.getLogger(__name__)

# Clerk configuration from environment
CLERK_DOMAIN = os.getenv('CLERK_DOMAIN', 'clerk.your-domain.com')
CLERK_SECRET_KEY = os.getenv('CLERK_SECRET_KEY')

# Cache for JWKS. Signing keys rotate, so entries expire; an unknown `kid`
# forces an immediate refresh (see verify_clerk_token).
_JWKS_TTL_SECONDS = 3600
_jwks_cache: dict[str, Any] | None = None
_jwks_cache_expires_at: float = 0.0


class JWKSUnavailableError(Exception):
    """Raised when Clerk's JWKS cannot be fetched and no cached copy exists."""


def get_jwks(*, force_refresh: bool = False) -> dict[str, Any]:
    """
    Fetch Clerk's JSON Web Key Set (JWKS) for JWT verification.

    Args:
        force_refresh: bypass the cache (used when a token references an
            unknown key ID, which usually means the keys rotated).

    Returns:
        JWKS dictionary

    Raises:
        JWKSUnavailableError: the IdP could not be reached and no cached copy
            is available.
    """
    global _jwks_cache, _jwks_cache_expires_at

    now = time.monotonic()
    if not force_refresh and _jwks_cache is not None and now < _jwks_cache_expires_at:
        return _jwks_cache

    jwks_url = f'https://{CLERK_DOMAIN}/.well-known/jwks.json'

    def _fetch_jwks():
        response = requests.get(jwks_url, timeout=Config.JWKS_TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.json()

    try:
        jwks = retry_with_backoff(
            _fetch_jwks,
            service="Clerk JWKS",
            attempts=Config.JWKS_ATTEMPTS,
        )
    except Exception as e:
        # Prefer a stale key set over logging everyone out during an outage:
        # previously valid signing keys remain valid until Clerk revokes them.
        if _jwks_cache is not None:
            logger.warning("JWKS refresh failed, using cached keys: %s", e)
            return _jwks_cache
        logger.error("Error fetching JWKS: %s", e)
        raise JWKSUnavailableError(str(e)) from e

    _jwks_cache = jwks
    _jwks_cache_expires_at = time.monotonic() + _JWKS_TTL_SECONDS
    return _jwks_cache


def _find_key(jwks: dict[str, Any], kid: str) -> dict[str, Any] | None:
    for jwk_key in jwks.get('keys', []):
        if jwk_key.get('kid') == kid:
            return jwk_key
    return None


def verify_clerk_token(token: str) -> dict[str, Any] | None:
    """
    Verify a Clerk JWT token.
    
    Args:
        token: The JWT token string
        
    Returns:
        Decoded token payload if valid, None otherwise
    """
    try:
        # Get the JWKS
        jwks = get_jwks()

        # Decode the token header to get the key ID
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get('kid')

        if not kid:
            return None

        # Find the matching key in JWKS
        key = _find_key(jwks, kid)

        # An unknown kid usually means Clerk rotated its signing keys. Refresh
        # once before rejecting the token.
        if not key:
            logger.info("Key %s not in cached JWKS; refreshing", kid)
            key = _find_key(get_jwks(force_refresh=True), kid)
            if not key:
                logger.warning("Key %s not found in refreshed JWKS", kid)
                return None

        # Verify and decode the token
        payload = jwt.decode(
            token,
            key,
            algorithms=['RS256'],
            options={
                'verify_aud': False,  # Clerk doesn't use aud claim by default
                'verify_iss': True,
            },
            issuer=f'https://{CLERK_DOMAIN}'
        )

        return payload

    except JWTError as e:
        logger.info("JWT verification failed: %s", e)
        return None
    except JWKSUnavailableError:
        raise
    except Exception as e:
        logger.exception("Unexpected error verifying token: %s", e)
        return None


def get_auth_token() -> str | None:
    """
    Extract bearer token from Authorization header.
    
    Returns:
        Token string if present, None otherwise
    """
    auth_header = request.headers.get('Authorization', '')
    
    if not auth_header.startswith('Bearer '):
        return None
    
    return auth_header[7:]  # Remove 'Bearer ' prefix


def require_auth(f):
    """
    Decorator to require authentication for a Flask route.
    
    Usage:
        @app.route('/protected')
        @require_auth
        def protected_route():
            # Access user_id from g.user
            user_id = g.user['sub']
            return {'message': 'Success'}
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # TESTING seam: allow deterministic auth without external JWKS/network.
        # This is only enabled when Flask TESTING is true.
        if current_app.config.get("TESTING") is True:
            test_user_id = request.headers.get("X-Test-User-Id")
            if test_user_id:
                from flask import g
                g.user = {"sub": test_user_id}
                g.user_id = test_user_id
                return f(*args, **kwargs)

        # Get token from header
        token = get_auth_token()
        
        if not token:
            return jsonify({'error': 'Missing authentication token'}), 401
        
        # Verify token
        try:
            payload = verify_clerk_token(token)
        except JWKSUnavailableError:
            return jsonify({'error': 'Authentication temporarily unavailable'}), 503

        if not payload or not payload.get('sub'):
            return jsonify({'error': 'Invalid authentication token'}), 401

        # Store user info in Flask's g object
        from flask import g
        g.user = payload
        g.user_id = payload['sub']  # Clerk uses 'sub' for user ID

        return f(*args, **kwargs)
    
    return decorated_function


def optional_auth(f):
    """
    Decorator that allows but doesn't require authentication.
    
    If a valid token is provided, user info is added to g.user.
    If no token or invalid token, request continues without user info.
    
    Usage:
        @app.route('/maybe-protected')
        @optional_auth
        def maybe_protected_route():
            from flask import g
            if hasattr(g, 'user'):
                # User is authenticated
                return {'message': f'Hello {g.user_id}'}
            else:
                # User is not authenticated
                return {'message': 'Hello guest'}
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get token from header
        token = get_auth_token()
        
        if token:
            # Verify token
            try:
                payload = verify_clerk_token(token)
            except JWKSUnavailableError:
                payload = None

            if payload:
                # Store user info in Flask's g object
                from flask import g
                g.user = payload
                g.user_id = payload.get('sub')
        
        return f(*args, **kwargs)
    
    return decorated_function

