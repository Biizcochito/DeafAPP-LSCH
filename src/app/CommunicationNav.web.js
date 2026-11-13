import './Communication.css';
import BrandHome from '../ui/BrandHome';

const destinations = [
  ['home', '/app', 'Grabar', 'camera'],
  ['interpretar', '/interpretar', 'Interpretar en vivo', 'eye'],
  ['conversar', '/conversar', 'Conversar', 'message'],
  ['tarjetas', '/tarjetas', 'Comunicación rápida', 'cards'],
];
const paths = {
  camera: 'M4 7h4l2-3h4l2 3h4v13H4ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  message: 'M21 3H3v14h5l4 4 4-4h5ZM7 8h10M7 12h6',
  cards: 'M3 5h14v14H3ZM7 2h14v14M7 10h6M7 14h4',
  mic: 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0ZM5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8',
  volume: 'M11 4 5 9H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
};
export function CommunicationIcon({name, size = 20}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.message}/></svg>;
}
export function AppLink({href, onNavigate, children, ...props}) {
  return <a href={href} {...props} onClick={event => {
    if (!onNavigate || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onNavigate();
  }}>{children}</a>;
}
export default function CommunicationNav({navigate, current}) {
  return <nav className="communication-nav" aria-label="Herramientas de DeafApp">{destinations.map(([screen, href, label, icon]) =>
    <AppLink key={screen} href={href} onNavigate={navigate ? () => navigate(screen) : undefined} aria-current={current === screen ? 'page' : undefined} data-tool={screen}>
      <CommunicationIcon name={icon}/><span>{label}</span>
    </AppLink>)}</nav>;
}
export function CommunicationHeader({navigate, current}) {
  return <header className="communication-header"><BrandHome className="communication-brand" size={40}/><CommunicationNav navigate={navigate} current={current}/></header>;
}
