import { zhExpected, enExpected } from './expected';
import { zhWeek, enWeek } from './week';
import { zhBase, enBase } from './base';
import { zhSettings, enSettings } from './settings';
import { zhPm, enPm } from './pm';
import { zhSetup, enSetup } from './setup';
import { zhReimburse, enReimburse } from './reimburse';
import { zhWorkbench, enWorkbench } from './workbench';
import { zhCalendar, enCalendar } from './calendar';
import { zhStyleGallery, enStyleGallery } from './stylegallery';
import { zhErrors, enErrors } from './errors';

export const zh = { ...zhErrors, ...zhExpected, ...zhWeek, ...zhBase, ...zhSettings, ...zhPm, ...zhSetup, ...zhReimburse, ...zhWorkbench, ...zhCalendar, ...zhStyleGallery };
export const en = { ...enErrors, ...enExpected, ...enWeek, ...enBase, ...enSettings, ...enPm, ...enSetup, ...enReimburse, ...enWorkbench, ...enCalendar, ...enStyleGallery };
