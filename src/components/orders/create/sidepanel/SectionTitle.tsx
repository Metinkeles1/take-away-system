interface SectionTitleProps {
  icon: React.ElementType;
  title: string;
  right?: React.ReactNode;
}

export function SectionTitle({ icon: Icon, title, right }: SectionTitleProps) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
      <div className="ml-auto">{right}</div>
    </div>
  );
}
