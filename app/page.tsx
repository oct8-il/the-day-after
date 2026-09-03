import './shell.css';
import parents from '@/data/parents.json';
import taxonomy from '@/data/taxonomy.json';

// Phase 0 shell. Its only job is to prove the design survived the move: the
// prototype's fonts, tokens and RTL, rendering the exported data. Every view
// listed here is ported in Phase 1, item page first.
export default function Home() {
  const incidents = 20;
  return (
    <main className="shell">
      <h1 className="shell-mark">היום שאחרי</h1>
      <p className="shell-sub">
        {parents.length} כשלים מערכתיים · {incidents} אירועים · הנתונים עדיין להמחשה
      </p>
      <ol className="shell-ramp">
        {taxonomy.stages.map((s) => (
          <li key={s.n} style={{ ['--c' as string]: s.color }}>
            <b>{s.n}</b>
            <span>{s.he}</span>
          </li>
        ))}
      </ol>
      <p className="shell-note">האתר בבנייה. הפרוטוטייפ הוא המפרט; הדפים עולים אחד אחד.</p>
    </main>
  );
}
