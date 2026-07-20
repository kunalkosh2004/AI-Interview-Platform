"""add resume_summary to interviews

Revision ID: a1b2c3d4e5f6
Revises: b10db5bb867c
Create Date: 2026-07-20 23:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "b10db5bb867c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("interviews", sa.Column("resume_summary", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("interviews", "resume_summary")
