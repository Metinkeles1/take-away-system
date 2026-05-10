import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { StickyNote, ChevronDown } from "lucide-react";

interface NotesSectionProps {
  notes: string;
  onChange: (value: string) => void;
}

export function NotesSection({ notes, onChange }: NotesSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
      >
        <StickyNote className="h-3.5 w-3.5" />
        Sipariş Notu
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
        {!open && notes && (
          <span className="text-[10px] font-normal text-foreground normal-case truncate max-w-40">
            · {notes}
          </span>
        )}
      </button>
      {open && (
        <Textarea
          placeholder="Özel talep, kapı kodu vb..."
          value={notes}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="mt-2 resize-none text-sm"
        />
      )}
    </section>
  );
}
