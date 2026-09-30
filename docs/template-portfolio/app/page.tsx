import Portfolio from '@/components/Portfolio';
import { ROLES } from '@/lib/roles';

/** Server component. The first role's prose is rendered on the server for SEO;
 *  Portfolio takes over on hydration and can rewrite it. */
export default function Page() {
  return <Portfolio initialRole="se" initialBio={ROLES.se.bio} />;
}
