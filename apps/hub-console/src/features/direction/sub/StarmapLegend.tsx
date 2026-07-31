import type { RoboticsDiscipline } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { blendColors, CROSSCUT_COLOR, DISCIPLINE_COLORS, GAP_COLOR } from '../starmap-data';

export function StarmapLegend({
  hubLabel,
}: {
  hubLabel: (d: RoboticsDiscipline) => string;
}) {
  const { t } = useI18n();
  return (
    <div className="direction-starmap__legend">
      {(Object.keys(DISCIPLINE_COLORS) as RoboticsDiscipline[]).map((d) => (
        <span key={d}>
          <i className="direction-starmap__swatch" style={{ background: DISCIPLINE_COLORS[d] }} />
          {hubLabel(d)}
        </span>
      ))}
      <span>
        <i
          className="direction-starmap__swatch"
          style={{
            background: `linear-gradient(90deg, ${DISCIPLINE_COLORS.ec}, ${blendColors([
              DISCIPLINE_COLORS.ec,
              DISCIPLINE_COLORS.mechanical,
            ])}, ${DISCIPLINE_COLORS.mechanical})`,
          }}
        />
        {t('direction.starmap.legend.cross')}
      </span>
      <span>
        <i
          className="direction-starmap__swatch direction-starmap__swatch--ring"
          style={{ borderColor: GAP_COLOR }}
        />
        {t('direction.starmap.legend.gap')}
      </span>
      <span>
        <i className="direction-starmap__swatch" style={{ background: CROSSCUT_COLOR }} />
        {t('direction.starmap.legend.ai')}
      </span>
    </div>
  );
}
