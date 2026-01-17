"""
Clerk Authentication Middleware for Flask

This module provides JWT verification for Clerk authentication tokens.
"""

import os
from functools import wraps
from typing import Any

import requests
from flask import current_app, jsonify, request
from jose import jwt
from jose.exceptions import JWTError

# Clerk configuration from environment
CLERK_DOMAIN = os.getenv('CLERK_DOMAIN', 'clerk.your-domain.com')
CLERK_SECRET_KEY = os.getenv('CLERK_SECRET_KEY')

# Cache for JWKS
_jwks_cache: dict[str, Any] | None = None


def get_jwks() -> dict[str, Any]:
    """
    Fetch Clerk's JSON Web Key Set (JWKS) for JWT verification.
    
    Returns:
        JWKS dictionary
    """
    global _jwks_cache
    
    if _jwks_cache is not None:
        return _jwks_cache
    
    # Fetch JWKS from Clerk
    jwks_url = f'https://{CLERK_DOMAIN}/.well-known/jwks.json'
    try:
        response = requests.get(jwks_url, timeout=10)
        response.raise_for_status()
        _jwks_cache = response.json()
        return _jwks_cache
    except Exception as e:
        print(f"Error fetching JWKS: {e}")
        raise


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
        key = None
        for jwk_key in jwks.get('keys', []):
            if jwk_key.get('kid') == kid:
                key = jwk_key
                break
        
        if not key:
            print(f"Key {kid} not found in JWKS")
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
        print(f"JWT verification failed: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error verifying token: {e}")
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
        payload = verify_clerk_token(token)
        
        if not payload:
            return jsonify({'error': 'Invalid authentication token'}), 401
        
        # Store user info in Flask's g object
        from flask import g
        g.user = payload
        g.user_id = payload.get('sub')  # Clerk uses 'sub' for user ID
        
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
            payload = verify_clerk_token(token)
            
            if payload:
                # Store user info in Flask's g object
                from flask import g
                g.user = payload
                g.user_id = payload.get('sub')
        
        return f(*args, **kwargs)
    
    return decorated_function

