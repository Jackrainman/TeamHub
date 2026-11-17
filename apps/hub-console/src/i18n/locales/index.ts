import { zhExpected, enExpected } from './expected';
import { zhWeek, enWeek } from './week';
import { zhBase, enBase } from './base';
import { zhSettings, enSettings } from './settings';
import { zhPm, enPm } from './pm';
import { zhSchedule, enSchedule } from './schedule';
import { zhInv, enInv } from './inv';
import { zhKb, enKb } from './kb';
import { zhOverview, enOverview } from './overview';
import { zhChecklist, enChecklist } from './checklist';
import { zhSetup, enSetup } from './setup';
import { zhReimburse, enReimburse } from './reimburse';
import { zhWorkbench, enWorkbench } from './workbench';
import { zhCalendar, enCalendar } from './calendar';
import { zhStyleGallery, enStyleGallery } from './stylegallery';
import { zhErrors, enErrors } from './errors';

export const zh = { ...zhErrors, ...zhExpected, ...zhWeek, ...zhBase, ...zhSettings, ...zhPm, ...zhSchedule, ...zhInv, ...zhKb, ...zhOverview, ...zhChecklist, ...zhSetup, ...zhReimburse, ...zhWorkbench, ...zhCalendar, ...zhStyleGallery };

export const en = { ...enErrors, ...enExpected, ...enWeek, ...enBase, ...enSettings, ...enPm, ...enSchedule, ...enInv, ...enKb, ...enOverview, ...enChecklist, ...enSetup, ...enReimburse, ...enWorkbench, ...enCalendar, ...enStyleGallery };
