'use client';

import { ROLES } from '@/lib/roles';
import { useRole } from '@/hooks/useRole';

/** Work and projects. Plain React — only the bio needs the imperative morph. */
export default function Lists() {
  const { role } = useRole();
  const r = ROLES[role];

  return (
    <>
      <section>
        <h2>Work</h2>
        <ol className="list">
          {r.work.map(([chip, where, what, years]) => (
            <li key={where + years}>
              <div className="pos">
                <a className="fav" href="#">
                  <i className="chip">{chip}</i>
                  <span>{where}</span>
                </a>
                <span className="desc">{what}</span>
              </div>
              <span className="years">{years}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Projects</h2>
        <ol className="list">
          {r.projects.map(([chip, name, desc]) => (
            <li key={name}>
              <div className="pos">
                <a className="fav" href="#">
                  <i className="chip">{chip}</i>
                  <span>{name}</span>
                </a>
                <span className="desc">{desc}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
