interface Props {
  studentId: string;
  onChange: (id: string) => void;
}

const STUDENTS = [
  { id: 'student_102', label: 'Student 102', hint: 'Probability · speed gap' },
  { id: 'student_205', label: 'Student 205', hint: 'Percentages · concept gap' }
];

export function StudentSwitcher({ studentId, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {STUDENTS.map(s => {
        const active = s.id === studentId;
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className={`rounded-xl border px-3.5 py-2 text-left transition-colors ${
              active ? 'border-teal bg-tealSoft' : 'border-line bg-panel hover:border-teal/40'
            }`}
          >
            <div className={`font-display text-sm font-semibold ${active ? 'text-teal' : 'text-ink'}`}>{s.label}</div>
            <div className="font-mono text-[11px] text-muted">{s.hint}</div>
          </button>
        );
      })}
    </div>
  );
}
