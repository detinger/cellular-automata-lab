import { Suspense, lazy, useEffect, useState } from 'react';
import { BookOpen, FlaskConical, GraduationCap, LayoutGrid, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react';
const LearnPage = lazy(() => import('../features/learning/LearnPage').then((m) => ({ default: m.LearnPage })));
const ComparePage = lazy(() => import('../features/compare/ComparePage').then((m) => ({ default: m.ComparePage })));
const LessonPage = lazy(() => import('../features/learning/LessonPage').then((m) => ({ default: m.LessonPage })));
const ChallengePage = lazy(() => import('../features/learning/ChallengePage').then((m) => ({ default: m.ChallengePage })));
const ExperimentPage = lazy(() => import('../features/experiments/ExperimentPage').then((m) => ({ default: m.ExperimentPage })));
const ExperimentsListPage = lazy(() => import('../features/experiments/ExperimentsListPage').then((m) => ({ default: m.ExperimentsListPage })));
import { markInterrupted } from '../storage/db';
import { useUpdateAvailable } from './offline';
import { BrandMark } from '../components/BrandMark';
import { ToastProvider } from '../components/ui';
import { LibraryPage } from '../features/library/LibraryPage';
import { CapabilitiesPage } from '../features/library/CapabilitiesPage';
const WorkspacePage = lazy(() => import('../features/modeler/WorkspacePage').then((m) => ({ default: m.WorkspacePage })));
import { useRoute } from './router';
import { ThemeProvider, useTheme } from './theme';

const NAV_KEY = 'ca-lab-nav-collapsed';

function Shell() {
  const route = useRoute();
  // Workers do not survive a reload: any experiment still marked running was interrupted.
  useEffect(() => {
    void markInterrupted().catch(() => {});
  }, []);
  const update = useUpdateAvailable();
  // Collapsed menu is a per-browser convenience; it works without storage too.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(NAV_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleNav = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(NAV_KEY, c ? '0' : '1');
      } catch {
        /* storage unavailable: the choice lasts for this page only */
      }
      return !c;
    });
  const { resolved, toggle } = useTheme();
  return (
    <div className="shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <nav className="nav" aria-label="Main" data-collapsed={collapsed}>
        <div className="nav-brand">
          <span className="brand-mark">
            <BrandMark />
          </span>
          <span className="wordmark">
            <span style={{ display: 'block', fontSize: 15, fontWeight: 650 }}>Cellular Automata Lab</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-subtle)' }}>Modelling &amp; Simulation</span>
          </span>
        </div>
        <div className="nav-group">
          <span className="nav-group-label">Workspace</span>
          <a
            className="nav-link"
            title={collapsed ? 'Models' : undefined}
            href="#/"
            aria-current={route.name === 'library' || route.name === 'project' || route.name === 'compare' ? 'page' : undefined}
          >
            <LayoutGrid size={18} aria-hidden />
            <span className="nav-label">Models</span>
          </a>
          <a
            className="nav-link"
            title={collapsed ? 'Learn' : undefined}
            href="#/learn"
            aria-current={route.name === 'learn' || route.name === 'lesson' || route.name === 'challenge' ? 'page' : undefined}
          >
            <GraduationCap size={18} aria-hidden />
            <span className="nav-label">Learn</span>
          </a>
          <a
            className="nav-link"
            title={collapsed ? 'Experiments' : undefined}
            href="#/experiments"
            aria-current={route.name === 'experiments' || route.name === 'experiment' ? 'page' : undefined}
          >
            <FlaskConical size={18} aria-hidden />
            <span className="nav-label">Experiments</span>
          </a>
          <a
            className="nav-link"
            title={collapsed ? 'Capabilities' : undefined}
            href="#/capabilities"
            aria-current={route.name === 'capabilities' ? 'page' : undefined}
          >
            <BookOpen size={18} aria-hidden />
            <span className="nav-label">Capabilities</span>
          </a>
        </div>
        <div className="nav-foot">
          <button
            className="nav-link nav-collapse"
            onClick={toggleNav}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
            <span className="nav-label">Collapse menu</span>
          </button>
          <button
            className="nav-link"
            onClick={toggle}
            aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
            title={collapsed ? `Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme` : undefined}
          >
            {resolved === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            <span className="nav-label">{resolved === 'dark' ? 'Light theme' : 'Dark theme'}</span>
          </button>
        </div>
      </nav>
      <main id="main" className="main" tabIndex={-1}>
        {update.ready && (
          <div className="update-banner" role="status">
            A new version of Cellular Automata Lab is ready. Pause running simulations and let saving finish, then
            <button className="btn btn-sm btn-primary" onClick={update.apply}>
              Reload to update
            </button>
          </div>
        )}
        <Suspense
          fallback={
            <div className="page">
              <p className="hint">Loading…</p>
            </div>
          }
        >
          {route.name === 'project' ? (
            <WorkspacePage key={route.id} projectId={route.id} />
          ) : route.name === 'capabilities' ? (
            <CapabilitiesPage />
          ) : route.name === 'experiments' ? (
            <ExperimentsListPage />
          ) : route.name === 'experiment' ? (
            <ExperimentPage key={route.id} id={route.id} />
          ) : route.name === 'compare' ? (
            <ComparePage key={`${route.a}/${route.b}`} a={route.a} b={route.b} />
          ) : route.name === 'learn' ? (
            <LearnPage />
          ) : route.name === 'lesson' ? (
            <LessonPage key={route.id} id={route.id} />
          ) : route.name === 'challenge' ? (
            <ChallengePage key={route.id} id={route.id} />
          ) : (
            <LibraryPage />
          )}
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </ThemeProvider>
  );
}
