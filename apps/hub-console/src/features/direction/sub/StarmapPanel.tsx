import type { RoboticsDiscipline } from '@teamhub/hub-contracts';
import { AI_BOUNDARY_CROSSCUT } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { DISCIPLINE_COLORS, type StarmapLink, type StarmapNode } from '../starmap-data';
import { KIND_KEY } from './constants';

export function StarmapPanel({
  selectedNode,
  nodes,
  links,
  hubLabel,
  onClose,
}: {
  selectedNode: StarmapNode;
  nodes: readonly StarmapNode[];
  links: readonly StarmapLink[];
  hubLabel: (d: RoboticsDiscipline) => string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <aside
      aria-label={t(KIND_KEY[selectedNode.kind])}
      className="direction-starmap__panel"
      role="dialog"
    >
      <header className="direction-starmap__panel-head">
        <span className="direction-starmap__panel-kind">{t(KIND_KEY[selectedNode.kind])}</span>
        {selectedNode.kind === 'gap' ? (
          <span
            className={`badge badge--tint${selectedNode.severity === 'emerging' ? '' : ' badge--red'}`}
          >
            {t(
              selectedNode.severity === 'emerging'
                ? 'direction.severity.emerging'
                : 'direction.severity.pressing',
            )}
          </span>
        ) : null}
        <button
          aria-label={t('direction.starmap.panel.close')}
          className="direction-starmap__panel-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>

      <p className="direction-starmap__panel-title">
        {selectedNode.kind === 'hub' ? hubLabel(selectedNode.disciplines[0]) : selectedNode.label}
        {selectedNode.kind === 'hub' && selectedNode.isMine
          ? ` · ${t('direction.starmap.mine')}`
          : ''}
      </p>

      {selectedNode.kind === 'hub' ? (
        <p className="direction-starmap__panel-detail">
          {t('direction.starmap.panel.stats', {
            skills: nodes.filter(
              (n) => n.kind === 'skill' && n.disciplines[0] === selectedNode.disciplines[0],
            ).length,
            gaps: nodes.filter(
              (n) => n.kind === 'gap' && n.disciplines[0] === selectedNode.disciplines[0],
            ).length,
          })}
        </p>
      ) : null}

      {selectedNode.detail && selectedNode.kind !== 'gap' ? (
        <p className="direction-starmap__panel-detail">{selectedNode.detail}</p>
      ) : null}
      {selectedNode.kind === 'crosscut' ? (
        <p className="direction-starmap__panel-detail">{AI_BOUNDARY_CROSSCUT.example}</p>
      ) : null}

      {selectedNode.kind !== 'hub' && selectedNode.disciplines.length > 0 ? (
        <div className="direction-starmap__panel-section">
          <span className="direction-starmap__panel-label">
            {t('direction.starmap.panel.disciplines')}
          </span>
          <div className="direction-starmap__tooltip-chips">
            {selectedNode.disciplines.map((d) => (
              <span key={d} style={{ color: DISCIPLINE_COLORS[d] }}>
                ● {hubLabel(d)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {selectedNode.kind === 'skill' || selectedNode.kind === 'crosscut' ? (
        <div className="direction-starmap__panel-section">
          <span className="direction-starmap__panel-label">
            {t('direction.starmap.panel.links')}
          </span>
          <ul className="direction-starmap__panel-links">
            {links
              .filter((l) => l.source === selectedNode.id)
              .map((l) => {
                const d = l.target.replace('hub-', '') as RoboticsDiscipline;
                return (
                  <li key={l.target}>
                    <i
                      className="direction-starmap__swatch"
                      style={{ background: DISCIPLINE_COLORS[d] }}
                    />
                    {hubLabel(d)}
                    <span className="direction-starmap__panel-linkkind">
                      {l.kind === 'own'
                        ? t('direction.starmap.panel.linkOwn')
                        : t('direction.starmap.panel.linkCross')}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      ) : null}

      {selectedNode.kind === 'gap' && selectedNode.skills && selectedNode.skills.length > 0 ? (
        <div className="direction-starmap__panel-section">
          <span className="direction-starmap__panel-label">{t('direction.card.skills')}</span>
          <div className="direction-starmap__panel-chips">
            {selectedNode.skills.map((skill) => (
              <span className="direction-starmap__panel-chip" key={skill}>
                {skill}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
