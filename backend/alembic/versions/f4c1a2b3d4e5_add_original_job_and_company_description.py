"""Add original job text and company description

Revision ID: f4c1a2b3d4e5
Revises: 8c061375c9cc
Create Date: 2026-10-07 15:10:37.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f4c1a2b3d4e5"
down_revision: Union[str, None] = "8c061375c9cc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("jobs", sa.Column("original_description", sa.Text(), nullable=True))
    op.add_column("jobs", sa.Column("description_fetch_method", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("jobs", "description_fetch_method")
    op.drop_column("jobs", "original_description")
    op.drop_column("companies", "description")
