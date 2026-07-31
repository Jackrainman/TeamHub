import type { RoboticsDiscipline } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { DISCIPLINE_COLORS } from '../starmap-data';
import { VB_W, VB_H, type Projected } from './constants';

export function StarmapTooltip({
  hovered,
  hubLabel,
}: {
  hovered: Projected;
  hubLabel: (d: RoboticsDiscipline) => string;
}) {
  const { t } = useI18n();
  return (
    <div
      className="direction-starmap__tooltip"
      style={{
        left: `${(hovered.sx / VB_W) * 100}%`,
        top: `${(hovered.sy / VB_H) * 100}%`,
      }}
    >
      {hovered.node.kind === 'gap' ? (
        <span
          className={`badge badge--tint${hovered.node.severity === 'emerging' ? '' : ' badge--red'}`}
        >
          {t(
            hovered.node.severity === 'emerging'
              ? 'direction.severity.emerging'
              : 'direction.severity.pressing',
          )}
        </span>
      ) : null}
      <p className="direction-starmap__tooltip-text">{hovered.node.label}</p>
      {hovered.node.detail ? (
        <p className="direction-starmap__tooltip-detail">{hovered.node.detail}</p>
      ) : null}
      {hovered.node.disciplines.length > 0 ? (
        <div className="direction-starmap__tooltip-chips">
          {hovered.node.disciplines.map((d) => (
            <span key={d} style={{ color: DISCIPLINE_COLORS[d] }}>
              ● {hubLabel(d)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
