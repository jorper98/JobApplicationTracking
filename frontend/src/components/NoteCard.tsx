"use client";

import type { ReactNode } from "react";
import {
  Briefcase,
  Building2,
  Calendar,
  Contact as ContactIcon,
  Pencil,
  Trash2,
} from "lucide-react";

export interface NoteTag {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string | null;
}

interface NoteCardProps {
  text: string;
  createdAt?: string;
  tags?: NoteTag[];
  footerExtra?: ReactNode;
  icon?: ReactNode;
  onOpen?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMore?: (text: string) => void;
  renderTag?: (tag: NoteTag) => ReactNode;
}

export function isLongNote(text: string) {
  return text.split("\n").length > 4 || text.length > 160;
}

function DefaultTagPill({ tag }: { tag: NoteTag }) {
  const Icon =
    tag.entity_type === "company"
      ? Building2
      : tag.entity_type === "job"
      ? Briefcase
      : ContactIcon;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
      <Icon className="w-3 h-3" />
      {tag.entity_name || tag.entity_id}
    </span>
  );
}

export function NoteCard({
  text,
  createdAt,
  tags = [],
  footerExtra,
  icon,
  onOpen,
  onEdit,
  onDelete,
  onMore,
  renderTag,
}: NoteCardProps) {
  const long = isLongNote(text);
  const body = (
    <>
      {icon && (
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm text-gray-700 dark:text-[#c0c0c8] whitespace-pre-wrap ${
            long ? "line-clamp-4" : ""
          }`}
        >
          {text}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {tags.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (renderTag ? renderTag(tag) : <DefaultTagPill key={tag.id} tag={tag} />))}
            </span>
          )}
          {footerExtra}
          {createdAt && (
            <span className="text-[11px] text-gray-400 dark:text-[#5a5a64] flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </>
  );
  return (
    <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] px-3 py-3">
      {onOpen ? (
        <button
          onClick={onOpen}
          className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-3 flex-1 min-w-0">{body}</div>
      )}
      <div className="flex items-center gap-1 shrink-0">
        {long && onMore && (
          <button
            onClick={() => onMore(text)}
            className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline px-1.5 py-1"
          >
            More
          </button>
        )}
        {onEdit && (
          <button
            onClick={onEdit}
            title="Edit note"
            className="p-1 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            title="Delete note"
            className="p-1 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
