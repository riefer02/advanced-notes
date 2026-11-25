"""Account-level storage operations: storage-key inventory and full purge."""

from __future__ import annotations

from sqlalchemy import or_

from ...database import AskHistory as AskHistoryORM
from ...database import AudioClip as AudioClipORM
from ...database import Digest as DigestORM
from ...database import EmailEvent as EmailEventORM
from ...database import EmailOutbox as EmailOutboxORM
from ...database import Feedback as FeedbackORM
from ...database import Folder as FolderORM
from ...database import Friendship as FriendshipORM
from ...database import MealEmbedding as MealEmbeddingORM
from ...database import MealEntry as MealEntryORM
from ...database import MealItem as MealItemORM
from ...database import Note as NoteORM
from ...database import NoteEmbedding as NoteEmbeddingORM
from ...database import NoteRevision as NoteRevisionORM
from ...database import NoteTag as NoteTagORM
from ...database import OpsEvent as OpsEventORM
from ...database import ProblemReport as ProblemReportORM
from ...database import ResourceShare as ResourceShareORM
from ...database import Tag as TagORM
from ...database import Todo as TodoORM
from ...database import TokenUsage as TokenUsageORM
from ...database import Transcript as TranscriptORM
from ...database import UsageCounter as UsageCounterORM
from ...database import UsageQuota as UsageQuotaORM
from ...database import UserProfile as UserProfileORM
from ...database import UserSettings as UserSettingsORM
from ...database import VinylEmbedding as VinylEmbeddingORM
from ...database import VinylImage as VinylImageORM
from ...database import VinylRecord as VinylRecordORM
from ...database import VinylTrack as VinylTrackORM


class AccountStorageMixin:
    """Everything needed to export or permanently erase one account."""

    def collect_user_storage_keys(self, user_id: str) -> dict[str, list[str]]:
        """Collect S3 keys before the rows that reference them are deleted."""
        with self._session_scope() as session:
            audio_keys = [
                key
                for (key,) in session.query(AudioClipORM.storage_key)
                .filter(AudioClipORM.user_id == user_id)
                .all()
            ]
            vinyl_keys = [
                key
                for (key,) in session.query(VinylImageORM.storage_key)
                .filter(VinylImageORM.user_id == user_id)
                .all()
            ]
            avatar_key = (
                session.query(UserProfileORM.avatar_storage_key)
                .filter(UserProfileORM.user_id == user_id)
                .scalar()
            )

        return {
            "audio": [key for key in audio_keys if key],
            "vinyl": [key for key in vinyl_keys if key],
            "avatar": [avatar_key] if avatar_key else [],
        }

    def purge_user_data(self, user_id: str) -> dict[str, int]:
        """Delete every row owned by the user, in child-first order.

        The caller is responsible for deleting S3 objects before calling this;
        the returned operation is intentionally a single transaction so a DB
        failure leaves the account intact for a retry.
        """
        counts: dict[str, int] = {}

        with self._session_scope() as session:
            def delete(model, *criteria) -> None:
                deleted = (
                    session.query(model)
                    .filter(*criteria)
                    .delete(synchronize_session=False)
                )
                if deleted:
                    name = model.__tablename__
                    counts[name] = counts.get(name, 0) + int(deleted)

            profile = (
                session.query(UserProfileORM)
                .filter(UserProfileORM.user_id == user_id)
                .one_or_none()
            )
            email = profile.email if profile else None

            # Note graph (children first).
            delete(NoteTagORM, NoteTagORM.user_id == user_id)
            delete(NoteRevisionORM, NoteRevisionORM.user_id == user_id)
            delete(TranscriptORM, TranscriptORM.user_id == user_id)
            delete(NoteEmbeddingORM, NoteEmbeddingORM.user_id == user_id)
            delete(AudioClipORM, AudioClipORM.user_id == user_id)
            delete(TodoORM, TodoORM.user_id == user_id)
            delete(NoteORM, NoteORM.user_id == user_id)
            delete(FolderORM, FolderORM.user_id == user_id)
            delete(TagORM, TagORM.user_id == user_id)

            # Meals.
            delete(MealItemORM, MealItemORM.user_id == user_id)
            delete(MealEmbeddingORM, MealEmbeddingORM.user_id == user_id)
            delete(MealEntryORM, MealEntryORM.user_id == user_id)

            # Vinyl.
            delete(VinylTrackORM, VinylTrackORM.user_id == user_id)
            delete(VinylImageORM, VinylImageORM.user_id == user_id)
            delete(VinylEmbeddingORM, VinylEmbeddingORM.user_id == user_id)
            delete(VinylRecordORM, VinylRecordORM.user_id == user_id)

            # AI history and feedback.
            delete(DigestORM, DigestORM.user_id == user_id)
            delete(AskHistoryORM, AskHistoryORM.user_id == user_id)
            delete(FeedbackORM, FeedbackORM.user_id == user_id)
            delete(ProblemReportORM, ProblemReportORM.user_id == user_id)
            delete(OpsEventORM, OpsEventORM.user_id == user_id)

            # Usage and billing counters.
            delete(TokenUsageORM, TokenUsageORM.user_id == user_id)
            delete(UsageCounterORM, UsageCounterORM.user_id == user_id)
            delete(UsageQuotaORM, UsageQuotaORM.user_id == user_id)

            # Social graph.
            delete(
                FriendshipORM,
                or_(
                    FriendshipORM.requester_id == user_id,
                    FriendshipORM.addressee_id == user_id,
                ),
            )
            delete(
                ResourceShareORM,
                or_(
                    ResourceShareORM.owner_id == user_id,
                    ResourceShareORM.shared_with_id == user_id,
                ),
            )

            # Admin email records that explicitly name this account.
            if email:
                delete(EmailOutboxORM, EmailOutboxORM.to_address == email)
                delete(EmailEventORM, EmailEventORM.recipients.like(f"%{email}%"))
                delete(ProblemReportORM, ProblemReportORM.contact_email == email)

            delete(UserSettingsORM, UserSettingsORM.user_id == user_id)
            delete(UserProfileORM, UserProfileORM.user_id == user_id)

        return counts
