import { useConfig } from '../config';
import { Section } from '../components/shared';

function Legal({ title, text }: { title: string; text: string }) {
  return (
    <Section title={title}>
      <div className="max-w-2xl space-y-3">{text.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}</div>
    </Section>
  );
}
export const Privacy = () => <Legal title="Privacy" text={useConfig().site.privacyText} />;
export const Terms = () => <Legal title="Terms" text={useConfig().site.termsText} />;
