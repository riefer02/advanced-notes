import re
import secrets
import string
from contextlib import suppress

from flask import Blueprint, g, jsonify, request
from sqlalchemy.exc import IntegrityError

from ..auth import require_auth
from ..services import s3_avatar
from ..services.container import get_services
from ._helpers import api_error

bp = Blueprint("sharing", __name__)


# ============================================================================
# Profile Helpers
# ============================================================================

_USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9_.]{1,28}[a-z0-9]$")
_AVATAR_MAX_BYTES = 1 * 1024 * 1024  # 1 MB
_AVATAR_ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}

_USERNAME_SUFFIX_CHARS = string.ascii_lowercase + string.digits


def _enrich_profile(profile_dict: dict) -> dict:
    """Add presigned avatar URL and strip internal storage key."""
    storage_key = profile_dict.pop("avatar_storage_key", None)
    if storage_key and s3_avatar.s3_available():
        try:
            profile_dict["avatar_url"] = s3_avatar.presign_get_avatar(storage_key=storage_key)
        except Exception:
            profile_dict["avatar_url"] = None
    return profile_dict


def _derive_display_name(email: str | None, user_id: str) -> str:
    """Derive a display name from email or fall back to 'User'."""
    if email and "@" in email:
        return email.split("@")[0].replace(".", " ").title()
    return "User"


def _random_suffix(length: int) -> str:
    return "".join(secrets.choice(_USERNAME_SUFFIX_CHARS) for _ in range(length))


def _generate_username(display_name: str, storage) -> str:
    """Generate a unique username from display_name + random suffix."""
    base = re.sub(r"[^a-z0-9]", "", display_name.lower())
    if not base:
        base = "user"
    base = base[:23]

    for _attempt in range(10):
        candidate = f"{base}_{_random_suffix(6)}"
        if not storage.get_username_exists(candidate):
            return candidate
    return f"user_{_random_suffix(12)}"


# ============================================================================
# Profile Endpoints
# ============================================================================


@bp.get("/profile")
@require_auth
def get_my_profile():
    """Get own profile, auto-creating if missing."""
    user_id = g.user_id
    svc = get_services()

    try:
        profile = svc.storage.get_user_profile(user_id)
        if not profile:
            email = getattr(g, "user_email", None)
            display_name = getattr(g, "user_name", None) or _derive_display_name(email, user_id)
            username = _generate_username(display_name, svc.storage)
            profile = svc.storage.create_user_profile(
                user_id=user_id,
                display_name=display_name,
                email=email,
                username=username,
            )
            svc.email.send_new_user_notification(
                user_id=user_id,
                display_name=display_name,
                email=email,
                username=username,
            )
        return jsonify(_enrich_profile(profile.model_dump()))
    except Exception as e:
        return api_error(str(e), 500)


@bp.put("/profile")
@require_auth
def update_my_profile():
    """Update own profile."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json(silent=True) or {}
        kwargs = {}
        if "display_name" in data:
            name = data["display_name"]
            if not name or len(name) > 255:
                return api_error("display_name must be 1-255 characters")
            kwargs["display_name"] = name
        if "username" in data:
            uname = data["username"]
            if uname is not None:
                uname = uname.lower().strip()
                if not _USERNAME_RE.match(uname):
                    return api_error("Username must be 3-30 characters, lowercase alphanumeric, periods, or underscores, starting/ending with alphanumeric")
                if svc.storage.get_username_exists(uname):
                    current = svc.storage.get_user_profile(user_id)
                    if not current or current.username != uname:
                        return api_error("Username already taken", 409)
            kwargs["username"] = uname
        if "bio" in data:
            kwargs["bio"] = data["bio"]
        if "discoverable" in data:
            kwargs["discoverable"] = bool(data["discoverable"])

        if not kwargs:
            return api_error("No fields to update")

        try:
            profile = svc.storage.update_user_profile(user_id, **kwargs)
        except IntegrityError:
            return api_error("Username already taken", 409)
        if not profile:
            return api_error("Profile not found", 404)
        return jsonify(_enrich_profile(profile.model_dump()))
    except Exception as e:
        return api_error(str(e), 500)


@bp.put("/profile/avatar")
@require_auth
def upload_avatar():
    """Upload or replace user avatar image."""
    user_id = g.user_id
    svc = get_services()

    try:
        if not s3_avatar.s3_available():
            return api_error("Avatar uploads are not configured", 501)

        if "file" not in request.files:
            return api_error("No file provided")
        file = request.files["file"]
        data = file.read()
        if len(data) > _AVATAR_MAX_BYTES:
            return api_error("File too large (max 1MB)")
        if not data:
            return api_error("Empty file")

        mime = (file.content_type or "").split(";")[0].strip().lower()
        if mime not in _AVATAR_ALLOWED_MIMES:
            return api_error("Only JPEG, PNG, and WebP images are allowed")

        storage_key = s3_avatar.object_key_for_avatar(user_id=user_id, mime_type=mime)
        s3_avatar.upload_avatar(storage_key=storage_key, content_type=mime, data=data)

        profile = svc.storage.update_user_profile_avatar(user_id, storage_key)
        if not profile:
            return api_error("Profile not found", 404)
        return jsonify(_enrich_profile(profile.model_dump()))
    except Exception as e:
        return api_error(str(e), 500)


@bp.delete("/profile/avatar")
@require_auth
def delete_avatar():
    """Remove user avatar."""
    user_id = g.user_id
    svc = get_services()

    try:
        profile = svc.storage.get_user_profile(user_id)
        if not profile:
            return api_error("Profile not found", 404)

        if profile.avatar_storage_key and s3_avatar.s3_available():
            with suppress(Exception):
                s3_avatar.delete_avatar(storage_key=profile.avatar_storage_key)

        profile = svc.storage.update_user_profile_avatar(user_id, None)
        return jsonify(_enrich_profile(profile.model_dump()))
    except Exception as e:
        return api_error(str(e), 500)


@bp.get("/profile/username-available")
@require_auth
def check_username_available():
    """Check if a username is available."""
    svc = get_services()
    username = request.args.get("username", "").lower().strip()
    if not username:
        return api_error("username parameter required")
    if not _USERNAME_RE.match(username):
        return jsonify({"available": False, "reason": "Invalid format"})
    exists = svc.storage.get_username_exists(username)
    return jsonify({"available": not exists})


@bp.get("/users/<target_user_id>/profile")
@require_auth
def get_user_profile(target_user_id):
    """View another user's profile (requires friendship or active share)."""
    user_id = g.user_id
    svc = get_services()

    try:
        if target_user_id == user_id:
            profile = svc.storage.get_user_profile(user_id)
            if not profile:
                return api_error("Profile not found", 404)
            return jsonify(_enrich_profile(profile.model_dump()))

        if not svc.storage.are_friends(user_id, target_user_id):
            has_any_share = (
                svc.storage.has_access(user_id, target_user_id, "vinyl_library")
                or svc.storage.has_access(user_id, target_user_id, "meal_calendar")
            )
            if not has_any_share:
                return api_error("Not authorized to view this profile", 403)

        profile = svc.storage.get_user_profile(target_user_id)
        if not profile:
            return api_error("Profile not found", 404)
        return jsonify(_enrich_profile(profile.model_dump()))
    except Exception as e:
        return api_error(str(e), 500)


# ============================================================================
# Friend Endpoints
# ============================================================================


@bp.get("/friends")
@require_auth
def list_friends():
    """List accepted friends with profiles."""
    user_id = g.user_id
    svc = get_services()

    try:
        friendships = svc.storage.list_friends(user_id)
        all_user_ids = set()
        for f in friendships:
            all_user_ids.add(f.requester_id)
            all_user_ids.add(f.addressee_id)

        profiles = svc.storage.get_user_profiles_batch(list(all_user_ids)) if all_user_ids else {}

        result = []
        for f in friendships:
            d = f.model_dump()
            d["requester_profile"] = _enrich_profile(profiles[f.requester_id].model_dump()) if f.requester_id in profiles else None
            d["addressee_profile"] = _enrich_profile(profiles[f.addressee_id].model_dump()) if f.addressee_id in profiles else None
            result.append(d)

        return jsonify({"friends": result})
    except Exception as e:
        return api_error(str(e), 500)


@bp.get("/friends/requests")
@require_auth
def list_friend_requests():
    """List pending incoming friend requests."""
    user_id = g.user_id
    svc = get_services()

    try:
        requests_list = svc.storage.list_pending_requests(user_id)
        requester_ids = [r.requester_id for r in requests_list]
        profiles = svc.storage.get_user_profiles_batch(requester_ids) if requester_ids else {}

        result = []
        for r in requests_list:
            d = r.model_dump()
            d["requester_profile"] = _enrich_profile(profiles[r.requester_id].model_dump()) if r.requester_id in profiles else None
            result.append(d)

        return jsonify({"requests": result})
    except Exception as e:
        return api_error(str(e), 500)


@bp.get("/friends/sent")
@require_auth
def list_sent_requests():
    """List pending outgoing friend requests."""
    user_id = g.user_id
    svc = get_services()

    try:
        sent = svc.storage.list_sent_requests(user_id)
        addressee_ids = [s.addressee_id for s in sent]
        profiles = svc.storage.get_user_profiles_batch(addressee_ids) if addressee_ids else {}

        result = []
        for s in sent:
            d = s.model_dump()
            d["addressee_profile"] = _enrich_profile(profiles[s.addressee_id].model_dump()) if s.addressee_id in profiles else None
            result.append(d)

        return jsonify({"sent": result})
    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/friends/request")
@require_auth
def send_friend_request():
    """Send a friend request."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json(silent=True) or {}
        target_id = data.get("user_id")
        if not target_id:
            return api_error("user_id is required")
        if target_id == user_id:
            return api_error("Cannot send friend request to yourself")

        existing = svc.storage.get_friendship_between(user_id, target_id)
        if existing:
            if existing.status == "accepted":
                return api_error("Already friends", 409)
            if existing.status == "pending":
                return api_error("Friend request already pending", 409)

        target_profile = svc.storage.get_user_profile(target_id)
        if not target_profile:
            return api_error("User not found", 404)

        friendship = svc.storage.create_friendship(user_id, target_id)
        return jsonify(friendship.model_dump()), 201
    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/friends/<friendship_id>/accept")
@require_auth
def accept_friend_request(friendship_id):
    """Accept a pending friend request."""
    user_id = g.user_id
    svc = get_services()

    try:
        friendship = svc.storage.get_friendship(friendship_id)
        if not friendship:
            return api_error("Friend request not found", 404)
        if friendship.addressee_id != user_id:
            return api_error("Not authorized", 403)
        if friendship.status != "pending":
            return api_error("Request is not pending", 400)

        updated = svc.storage.update_friendship_status(friendship_id, "accepted")
        return jsonify(updated.model_dump())
    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/friends/<friendship_id>/decline")
@require_auth
def decline_friend_request(friendship_id):
    """Decline a pending friend request."""
    user_id = g.user_id
    svc = get_services()

    try:
        friendship = svc.storage.get_friendship(friendship_id)
        if not friendship:
            return api_error("Friend request not found", 404)
        if friendship.addressee_id != user_id:
            return api_error("Not authorized", 403)
        if friendship.status != "pending":
            return api_error("Request is not pending", 400)

        updated = svc.storage.update_friendship_status(friendship_id, "declined")
        return jsonify(updated.model_dump())
    except Exception as e:
        return api_error(str(e), 500)


@bp.delete("/friends/<friendship_id>")
@require_auth
def remove_friend(friendship_id):
    """Remove a friend (either party can do this)."""
    user_id = g.user_id
    svc = get_services()

    try:
        friendship = svc.storage.get_friendship(friendship_id)
        if not friendship:
            return api_error("Friendship not found", 404)
        if friendship.requester_id != user_id and friendship.addressee_id != user_id:
            return api_error("Not authorized", 403)

        other_id = friendship.addressee_id if friendship.requester_id == user_id else friendship.requester_id
        svc.storage.revoke_shares_between(user_id, other_id)
        svc.storage.delete_friendship(friendship_id)
        return jsonify({"deleted": True})
    except Exception as e:
        return api_error(str(e), 500)


@bp.get("/friends/search")
@require_auth
def search_friends():
    """Search discoverable users by name/email."""
    user_id = g.user_id
    svc = get_services()

    try:
        q = request.args.get("q", "").strip()
        if len(q) < 2:
            return api_error("Search query must be at least 2 characters")

        profiles = svc.storage.search_user_profiles(q, exclude_user_id=user_id, limit=20)
        return jsonify({"users": [_enrich_profile(p.model_dump()) for p in profiles]})
    except Exception as e:
        return api_error(str(e), 500)


# ============================================================================
# Share Endpoints
# ============================================================================


@bp.post("/shares")
@require_auth
def create_share():
    """Create a share invitation (must be friends)."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json(silent=True) or {}
        shared_with_id = data.get("shared_with_id")
        resource_type = data.get("resource_type")
        permission = data.get("permission", "view")

        if not shared_with_id or not resource_type:
            return api_error("shared_with_id and resource_type are required")
        if shared_with_id == user_id:
            return api_error("Cannot share with yourself")
        if resource_type not in ("vinyl_library", "meal_calendar"):
            return api_error("Invalid resource_type. Must be vinyl_library or meal_calendar")
        if permission not in ("view", "edit"):
            return api_error("Invalid permission. Must be view or edit")
        if resource_type == "vinyl_library" and permission == "edit":
            return api_error("Vinyl library only supports view permission")

        if not svc.storage.are_friends(user_id, shared_with_id):
            return api_error("Must be friends to share", 403)

        existing = svc.storage.get_share_between(user_id, shared_with_id, resource_type)
        if existing and existing.status in ("pending", "accepted"):
            return api_error("Share already exists", 409)

        share = svc.storage.create_resource_share(user_id, shared_with_id, resource_type, permission)
        return jsonify(share.model_dump()), 201
    except Exception as e:
        return api_error(str(e), 500)


@bp.get("/shares")
@require_auth
def list_shares():
    """List all shares (owned + received)."""
    user_id = g.user_id
    svc = get_services()

    try:
        owned = svc.storage.list_shares_as_owner(user_id)
        received = svc.storage.list_shares_as_recipient(user_id)

        all_user_ids = set()
        for s in owned:
            all_user_ids.add(s.shared_with_id)
        for s in received:
            all_user_ids.add(s.owner_id)
        profiles = svc.storage.get_user_profiles_batch(list(all_user_ids)) if all_user_ids else {}

        def enrich(share, role):
            d = share.model_dump()
            if role == "owner":
                d["shared_with_profile"] = _enrich_profile(profiles[share.shared_with_id].model_dump()) if share.shared_with_id in profiles else None
            else:
                d["owner_profile"] = _enrich_profile(profiles[share.owner_id].model_dump()) if share.owner_id in profiles else None
            return d

        return jsonify({
            "owned": [enrich(s, "owner") for s in owned],
            "received": [enrich(s, "recipient") for s in received],
        })
    except Exception as e:
        return api_error(str(e), 500)


@bp.get("/shares/received")
@require_auth
def list_received_shares():
    """List pending incoming share invitations."""
    user_id = g.user_id
    svc = get_services()

    try:
        received = svc.storage.list_shares_as_recipient(user_id, status="pending")
        owner_ids = [s.owner_id for s in received]
        profiles = svc.storage.get_user_profiles_batch(owner_ids) if owner_ids else {}

        result = []
        for s in received:
            d = s.model_dump()
            d["owner_profile"] = _enrich_profile(profiles[s.owner_id].model_dump()) if s.owner_id in profiles else None
            result.append(d)

        return jsonify({"received": result})
    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/shares/<share_id>/accept")
@require_auth
def accept_share(share_id):
    """Accept a share invitation."""
    user_id = g.user_id
    svc = get_services()

    try:
        share = svc.storage.get_resource_share(share_id)
        if not share:
            return api_error("Share not found", 404)
        if share.shared_with_id != user_id:
            return api_error("Not authorized", 403)
        if share.status != "pending":
            return api_error("Share is not pending", 400)

        updated = svc.storage.update_share_status(share_id, "accepted")
        return jsonify(updated.model_dump())
    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/shares/<share_id>/decline")
@require_auth
def decline_share(share_id):
    """Decline a share invitation."""
    user_id = g.user_id
    svc = get_services()

    try:
        share = svc.storage.get_resource_share(share_id)
        if not share:
            return api_error("Share not found", 404)
        if share.shared_with_id != user_id:
            return api_error("Not authorized", 403)
        if share.status != "pending":
            return api_error("Share is not pending", 400)

        updated = svc.storage.update_share_status(share_id, "declined")
        return jsonify(updated.model_dump())
    except Exception as e:
        return api_error(str(e), 500)


@bp.delete("/shares/<share_id>")
@require_auth
def revoke_share(share_id):
    """Revoke (owner) or leave (recipient) a share."""
    user_id = g.user_id
    svc = get_services()

    try:
        share = svc.storage.get_resource_share(share_id)
        if not share:
            return api_error("Share not found", 404)
        if share.owner_id != user_id and share.shared_with_id != user_id:
            return api_error("Not authorized", 403)

        svc.storage.update_share_status(share_id, "revoked")
        return jsonify({"deleted": True})
    except Exception as e:
        return api_error(str(e), 500)
