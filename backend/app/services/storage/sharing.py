"""Sharing & collaboration storage mixin: profiles, friendships, resource shares."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import desc, func, or_

from ...database import Friendship as FriendshipORM
from ...database import ResourceShare as ResourceShareORM
from ...database import UserProfile as UserProfileORM
from ..models import FriendshipResponse as FriendshipDTO
from ..models import ResourceShareResponse as ResourceShareDTO
from ..models import UserProfileResponse as UserProfileDTO


class SharingStorageMixin:
    """User profiles, friendships, and resource sharing operations."""

    # -----------------------------------------------------------------------
    # Profiles
    # -----------------------------------------------------------------------

    def create_user_profile(
        self,
        user_id: str,
        display_name: str,
        email: str | None = None,
        avatar_url: str | None = None,
        username: str | None = None,
    ) -> UserProfileDTO:
        with self._session_scope() as session:
            now = datetime.utcnow()
            profile_id = str(uuid4())
            db_profile = UserProfileORM(
                id=profile_id,
                user_id=user_id,
                display_name=display_name,
                username=username,
                email=email,
                avatar_url=avatar_url,
                discoverable=True,
                created_at=now,
                updated_at=now,
            )
            session.add(db_profile)
            session.flush()
            return self._profile_to_dto(db_profile)

    def get_user_profile(self, user_id: str) -> UserProfileDTO | None:
        with self._session_scope() as session:
            p = (
                session.query(UserProfileORM)
                .filter(UserProfileORM.user_id == user_id)
                .one_or_none()
            )
            return self._profile_to_dto(p) if p else None

    def get_user_profile_by_id(self, profile_id: str) -> UserProfileDTO | None:
        with self._session_scope() as session:
            p = (
                session.query(UserProfileORM)
                .filter(UserProfileORM.id == profile_id)
                .one_or_none()
            )
            return self._profile_to_dto(p) if p else None

    def update_user_profile(
        self,
        user_id: str,
        *,
        display_name: str | None = None,
        username: str | None = ...,  # type: ignore[assignment]
        bio: str | None = ...,  # type: ignore[assignment]
        discoverable: bool | None = None,
    ) -> UserProfileDTO | None:
        with self._session_scope() as session:
            p = (
                session.query(UserProfileORM)
                .filter(UserProfileORM.user_id == user_id)
                .one_or_none()
            )
            if not p:
                return None
            if display_name is not None:
                p.display_name = display_name
            if username is not ...:
                p.username = username
            if bio is not ...:
                p.bio = bio
            if discoverable is not None:
                p.discoverable = discoverable
            p.updated_at = datetime.utcnow()
            session.flush()
            return self._profile_to_dto(p)

    def update_user_profile_avatar(
        self,
        user_id: str,
        avatar_storage_key: str | None,
    ) -> UserProfileDTO | None:
        with self._session_scope() as session:
            p = (
                session.query(UserProfileORM)
                .filter(UserProfileORM.user_id == user_id)
                .one_or_none()
            )
            if not p:
                return None
            p.avatar_storage_key = avatar_storage_key
            p.updated_at = datetime.utcnow()
            session.flush()
            return self._profile_to_dto(p)

    def get_username_exists(self, username: str) -> bool:
        with self._session_scope() as session:
            return (
                session.query(UserProfileORM)
                .filter(func.lower(UserProfileORM.username) == username.lower())
                .count()
                > 0
            )

    def search_user_profiles(self, query: str, *, limit: int = 20, exclude_user_id: str | None = None) -> list[UserProfileDTO]:
        with self._session_scope() as session:
            like = f"%{query}%"
            q = session.query(UserProfileORM).filter(
                UserProfileORM.discoverable.is_(True),
                or_(
                    UserProfileORM.display_name.ilike(like),
                    UserProfileORM.email.ilike(like),
                    UserProfileORM.username.ilike(like),
                ),
            )
            if exclude_user_id:
                q = q.filter(UserProfileORM.user_id != exclude_user_id)
            results = q.limit(max(limit, 1)).all()
            return [self._profile_to_dto(p) for p in results]

    def get_user_profiles_batch(self, user_ids: list[str]) -> dict[str, UserProfileDTO]:
        if not user_ids:
            return {}
        with self._session_scope() as session:
            profiles = (
                session.query(UserProfileORM)
                .filter(UserProfileORM.user_id.in_(user_ids))
                .all()
            )
            return {p.user_id: self._profile_to_dto(p) for p in profiles}

    @staticmethod
    def _profile_to_dto(p: UserProfileORM) -> UserProfileDTO:
        return UserProfileDTO(
            id=p.id,
            user_id=p.user_id,
            display_name=p.display_name,
            username=p.username,
            email=p.email,
            avatar_url=p.avatar_url,
            avatar_storage_key=p.avatar_storage_key,
            bio=p.bio,
            discoverable=p.discoverable,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )

    # -----------------------------------------------------------------------
    # Friendships
    # -----------------------------------------------------------------------

    def create_friendship(self, requester_id: str, addressee_id: str) -> FriendshipDTO:
        with self._session_scope() as session:
            now = datetime.utcnow()
            friendship = FriendshipORM(
                id=str(uuid4()),
                requester_id=requester_id,
                addressee_id=addressee_id,
                status="pending",
                created_at=now,
                updated_at=now,
            )
            session.add(friendship)
            session.flush()
            return self._friendship_to_dto(friendship)

    def get_friendship(self, friendship_id: str) -> FriendshipDTO | None:
        with self._session_scope() as session:
            f = session.query(FriendshipORM).filter(FriendshipORM.id == friendship_id).one_or_none()
            return self._friendship_to_dto(f) if f else None

    def get_friendship_between(self, user_a: str, user_b: str) -> FriendshipDTO | None:
        with self._session_scope() as session:
            f = (
                session.query(FriendshipORM)
                .filter(
                    or_(
                        (FriendshipORM.requester_id == user_a) & (FriendshipORM.addressee_id == user_b),
                        (FriendshipORM.requester_id == user_b) & (FriendshipORM.addressee_id == user_a),
                    )
                )
                .one_or_none()
            )
            return self._friendship_to_dto(f) if f else None

    def update_friendship_status(self, friendship_id: str, status: str) -> FriendshipDTO | None:
        with self._session_scope() as session:
            f = session.query(FriendshipORM).filter(FriendshipORM.id == friendship_id).one_or_none()
            if not f:
                return None
            f.status = status
            f.updated_at = datetime.utcnow()
            session.flush()
            return self._friendship_to_dto(f)

    def list_friends(self, user_id: str) -> list[FriendshipDTO]:
        with self._session_scope() as session:
            friendships = (
                session.query(FriendshipORM)
                .filter(
                    FriendshipORM.status == "accepted",
                    or_(
                        FriendshipORM.requester_id == user_id,
                        FriendshipORM.addressee_id == user_id,
                    ),
                )
                .order_by(desc(FriendshipORM.updated_at))
                .all()
            )
            return [self._friendship_to_dto(f) for f in friendships]

    def list_pending_requests(self, user_id: str) -> list[FriendshipDTO]:
        with self._session_scope() as session:
            friendships = (
                session.query(FriendshipORM)
                .filter(
                    FriendshipORM.addressee_id == user_id,
                    FriendshipORM.status == "pending",
                )
                .order_by(desc(FriendshipORM.created_at))
                .all()
            )
            return [self._friendship_to_dto(f) for f in friendships]

    def list_sent_requests(self, user_id: str) -> list[FriendshipDTO]:
        with self._session_scope() as session:
            friendships = (
                session.query(FriendshipORM)
                .filter(
                    FriendshipORM.requester_id == user_id,
                    FriendshipORM.status == "pending",
                )
                .order_by(desc(FriendshipORM.created_at))
                .all()
            )
            return [self._friendship_to_dto(f) for f in friendships]

    def are_friends(self, user_a: str, user_b: str) -> bool:
        with self._session_scope() as session:
            f = (
                session.query(FriendshipORM)
                .filter(
                    FriendshipORM.status == "accepted",
                    or_(
                        (FriendshipORM.requester_id == user_a) & (FriendshipORM.addressee_id == user_b),
                        (FriendshipORM.requester_id == user_b) & (FriendshipORM.addressee_id == user_a),
                    ),
                )
                .one_or_none()
            )
            return f is not None

    def delete_friendship(self, friendship_id: str) -> bool:
        with self._session_scope() as session:
            f = session.query(FriendshipORM).filter(FriendshipORM.id == friendship_id).one_or_none()
            if not f:
                return False
            session.delete(f)
            return True

    @staticmethod
    def _friendship_to_dto(f: FriendshipORM) -> FriendshipDTO:
        return FriendshipDTO(
            id=f.id,
            requester_id=f.requester_id,
            addressee_id=f.addressee_id,
            status=f.status,
            created_at=f.created_at,
            updated_at=f.updated_at,
        )

    # -----------------------------------------------------------------------
    # Resource shares
    # -----------------------------------------------------------------------

    def create_resource_share(
        self,
        owner_id: str,
        shared_with_id: str,
        resource_type: str,
        permission: str = "view",
    ) -> ResourceShareDTO:
        with self._session_scope() as session:
            now = datetime.utcnow()
            share = ResourceShareORM(
                id=str(uuid4()),
                owner_id=owner_id,
                shared_with_id=shared_with_id,
                resource_type=resource_type,
                permission=permission,
                status="pending",
                created_at=now,
                updated_at=now,
            )
            session.add(share)
            session.flush()
            return self._share_to_dto(share)

    def get_resource_share(self, share_id: str) -> ResourceShareDTO | None:
        with self._session_scope() as session:
            s = session.query(ResourceShareORM).filter(ResourceShareORM.id == share_id).one_or_none()
            return self._share_to_dto(s) if s else None

    def update_share_status(self, share_id: str, status: str) -> ResourceShareDTO | None:
        with self._session_scope() as session:
            s = session.query(ResourceShareORM).filter(ResourceShareORM.id == share_id).one_or_none()
            if not s:
                return None
            s.status = status
            s.updated_at = datetime.utcnow()
            session.flush()
            return self._share_to_dto(s)

    def list_shares_as_owner(self, owner_id: str) -> list[ResourceShareDTO]:
        with self._session_scope() as session:
            shares = (
                session.query(ResourceShareORM)
                .filter(ResourceShareORM.owner_id == owner_id)
                .order_by(desc(ResourceShareORM.created_at))
                .all()
            )
            return [self._share_to_dto(s) for s in shares]

    def list_shares_as_recipient(self, user_id: str, *, status: str | None = None) -> list[ResourceShareDTO]:
        with self._session_scope() as session:
            q = session.query(ResourceShareORM).filter(ResourceShareORM.shared_with_id == user_id)
            if status:
                q = q.filter(ResourceShareORM.status == status)
            shares = q.order_by(desc(ResourceShareORM.created_at)).all()
            return [self._share_to_dto(s) for s in shares]

    def list_accepted_shares_for_resource(self, owner_id: str, resource_type: str) -> list[ResourceShareDTO]:
        with self._session_scope() as session:
            shares = (
                session.query(ResourceShareORM)
                .filter(
                    ResourceShareORM.owner_id == owner_id,
                    ResourceShareORM.resource_type == resource_type,
                    ResourceShareORM.status == "accepted",
                )
                .all()
            )
            return [self._share_to_dto(s) for s in shares]

    def get_share_between(self, owner_id: str, shared_with_id: str, resource_type: str) -> ResourceShareDTO | None:
        with self._session_scope() as session:
            s = (
                session.query(ResourceShareORM)
                .filter(
                    ResourceShareORM.owner_id == owner_id,
                    ResourceShareORM.shared_with_id == shared_with_id,
                    ResourceShareORM.resource_type == resource_type,
                )
                .one_or_none()
            )
            return self._share_to_dto(s) if s else None

    def delete_share(self, share_id: str) -> bool:
        with self._session_scope() as session:
            s = session.query(ResourceShareORM).filter(ResourceShareORM.id == share_id).one_or_none()
            if not s:
                return False
            session.delete(s)
            return True

    def has_access(self, viewer_id: str, owner_id: str, resource_type: str, min_permission: str = "view") -> bool:
        if viewer_id == owner_id:
            return True
        allowed = ["view", "edit"] if min_permission == "view" else ["edit"]
        with self._session_scope() as session:
            s = (
                session.query(ResourceShareORM)
                .filter(
                    ResourceShareORM.owner_id == owner_id,
                    ResourceShareORM.shared_with_id == viewer_id,
                    ResourceShareORM.resource_type == resource_type,
                    ResourceShareORM.status == "accepted",
                    ResourceShareORM.permission.in_(allowed),
                )
                .one_or_none()
            )
            return s is not None

    def get_calendar_member_ids(self, owner_id: str) -> list[str]:
        with self._session_scope() as session:
            shares = (
                session.query(ResourceShareORM)
                .filter(
                    ResourceShareORM.owner_id == owner_id,
                    ResourceShareORM.resource_type == "meal_calendar",
                    ResourceShareORM.status == "accepted",
                    ResourceShareORM.permission == "edit",
                )
                .all()
            )
            return [owner_id] + [s.shared_with_id for s in shares]

    def revoke_shares_between(self, user_a: str, user_b: str) -> int:
        with self._session_scope() as session:
            shares = (
                session.query(ResourceShareORM)
                .filter(
                    or_(
                        (ResourceShareORM.owner_id == user_a) & (ResourceShareORM.shared_with_id == user_b),
                        (ResourceShareORM.owner_id == user_b) & (ResourceShareORM.shared_with_id == user_a),
                    )
                )
                .all()
            )
            count = 0
            for s in shares:
                s.status = "revoked"
                s.updated_at = datetime.utcnow()
                count += 1
            return count

    @staticmethod
    def _share_to_dto(s: ResourceShareORM) -> ResourceShareDTO:
        return ResourceShareDTO(
            id=s.id,
            owner_id=s.owner_id,
            shared_with_id=s.shared_with_id,
            resource_type=s.resource_type,
            permission=s.permission,
            status=s.status,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
