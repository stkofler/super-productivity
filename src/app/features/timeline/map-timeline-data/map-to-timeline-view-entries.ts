import { Task, TaskWithoutReminder, TaskWithReminder } from '../../tasks/task.model';
import {
  BlockedBlock,
  BlockedBlockType,
  TimelineViewEntry,
  TimelineViewEntryType,
  TimelineWorkStartEndCfg
} from '../timeline.model';
import { getDateTimeFromClockString } from '../../../util/get-date-time-from-clock-string';
import { createSortedBlockerBlocks } from './create-sorted-blocker-blocks';
import { getTimeLeftForTask } from '../../../util/get-time-left-for-task';
import { createTimelineViewEntriesForNormalTasks } from './create-timeline-view-entries-for-normal-tasks';
import * as moment from 'moment';


export const mapToTimelineViewEntries = (
  tasks: Task[],
  currentId: string | null,
  workStartEndCfg?: TimelineWorkStartEndCfg,
  now: number = Date.now(),
): TimelineViewEntry[] => {
  let startTime = now;
  const params: any = {tasks, currentId, workStartEndCfg, now};
  console.log('mapToViewEntries', params, {asString: JSON.stringify(params)});

  if (workStartEndCfg) {
    const startTimeToday = getDateTimeFromClockString(workStartEndCfg.startTime, now);
    if (startTimeToday > now && !currentId) {
      startTime = startTimeToday;
    }
  }
  // TODO check for scheduled is current
  const initialTasks: Task[] = currentId
    ? resortTasksWithCurrentFirst(currentId, tasks)
    : tasks;

  const [scheduledTasks, nonScheduledTasks] = createSplitScheduledAndNotScheduled(initialTasks);
  const viewEntries = createTimelineViewEntriesForNormalTasks(startTime, nonScheduledTasks);

  const blockedBlocks = createSortedBlockerBlocks(scheduledTasks, workStartEndCfg, now);

  insertBlockedBlocksViewEntries(viewEntries, blockedBlocks, now);

  // CLEANUP
  // -------
  viewEntries.sort((a, b) => {
    if ((a.time - b.time) === 0) {
      switch (a.type) {
        case TimelineViewEntryType.WorkdayEnd:
          return 1;
        case TimelineViewEntryType.WorkdayStart:
          return -1;
      }
    }
    return a.time - b.time;
  });

  // Move current always first and let it appear as now
  if (currentId) {
    const currentIndex = viewEntries.findIndex(ve => ve.id === currentId);
    viewEntries[currentIndex].time = now - 600000;
    viewEntries.splice(0, 0, viewEntries[currentIndex]);
    viewEntries.splice(currentIndex + 1, 1);
  }

  if (viewEntries[0]?.type === TimelineViewEntryType.WorkdayEnd) {
    viewEntries.splice(0, 1);
  }

  let isWorkdayTypeLast = true;
  while (isWorkdayTypeLast) {
    const last = viewEntries[viewEntries.length];
    if (last && (last.type === TimelineViewEntryType.WorkdayEnd || last.type === TimelineViewEntryType.WorkdayStart)) {
      viewEntries.splice(viewEntries.length, 1);
    } else {
      isWorkdayTypeLast = false;
    }
  }

  // console.log('mapToViewEntriesE', viewEntries, {asString: JSON.stringify(viewEntries)});
  return viewEntries;
};

const createSplitScheduledAndNotScheduled = (tasks: Task[]): [TaskWithReminder[], TaskWithoutReminder[]] => {
  const scheduledTasks: TaskWithReminder[] = [];
  const nonScheduledTasks: TaskWithoutReminder[] = [];
  tasks.forEach((task, index, arr) => {
    if (task.reminderId && task.plannedAt) {
      scheduledTasks.push(task as TaskWithReminder);
    } else {
      nonScheduledTasks.push(task as TaskWithoutReminder);
    }
  });
  return [scheduledTasks, nonScheduledTasks];
};

const createViewEntriesForBlock = (blockedBlock: BlockedBlock): TimelineViewEntry[] => {
  const viewEntriesForBock: TimelineViewEntry[] = [];
  blockedBlock.entries.forEach(entry => {
    if (entry.type === BlockedBlockType.ScheduledTask) {
      const scheduledTask = entry.data;
      viewEntriesForBock.push({
        id: scheduledTask.id,
        time: scheduledTask.plannedAt,
        type: TimelineViewEntryType.ScheduledTask,
        data: scheduledTask,
        isHideTime: false,
      });
    } else if (entry.type === BlockedBlockType.WorkdayStartEnd) {
      // NOTE: day start and end are mixed up, because it is the opposite as the blocked range

      const workdayCfg = entry.data;
      viewEntriesForBock.push({
        id: 'DAY_END_' + entry.start,
        time: entry.start,
        type: TimelineViewEntryType.WorkdayEnd,
        data: workdayCfg,
        isHideTime: false,
      });
      viewEntriesForBock.push({
        id: 'DAY_START_' + entry.end,
        time: entry.end,
        type: TimelineViewEntryType.WorkdayStart,
        data: workdayCfg,
        isHideTime: false,
      });
    }
  });
  viewEntriesForBock.sort((a, b) => a.time - b.time);

  return viewEntriesForBock;
};

const insertBlockedBlocksViewEntries = (viewEntries: TimelineViewEntry[], blockedBlocks: BlockedBlock[], now: number) => {
  if (!blockedBlocks.length) {
    return;
  }
  const viewEntriesForUnScheduled = viewEntries.slice(0);

  console.log(viewEntries.map(viewEntry => ({
    viewEntry,
    timeD: moment(viewEntry.time).format('H:mm'),
    durationH: getTimeLeftForTask(viewEntry.data as any) / 60000 / 60,
  })));
  // console.log(blockedBlocks.map(block => ({
  //   block,
  //   startD: moment(block.start).format('H:mm'),
  //   endD: moment(block.end).format('H:mm'),
  // })));

  blockedBlocks.forEach((blockedBlock, i) => {
    const viewEntriesToAdd: TimelineViewEntry[] = createViewEntriesForBlock(blockedBlock);
    if (blockedBlock.start <= now) {
      const timeToGoForBlock = blockedBlock.end - now;
      viewEntriesForUnScheduled.forEach(viewEntry => {
        viewEntry.time = viewEntry.time + timeToGoForBlock;
      });

      // add entries
      viewEntries.splice(viewEntries.length, 0, ...viewEntriesToAdd);
      return;
    }

    const viewEntryForSplitTask: TimelineViewEntry | undefined = viewEntriesForUnScheduled.find(
      viewEntry =>
        viewEntry.time !== 0 &&
        viewEntry.time + getTimeLeftForTask(viewEntry.data as TaskWithoutReminder) >= blockedBlock.start &&
        viewEntry.time + getTimeLeftForTask(viewEntry.data as TaskWithoutReminder) <= blockedBlock.end
    );

    if (viewEntryForSplitTask) {
      const splitTask: TaskWithoutReminder = viewEntryForSplitTask.data as TaskWithoutReminder;
      let timePlannedForSplitTaskContinued = 0;
      const timeLeftForCompleteSplitTask = getTimeLeftForTask(splitTask);

      const timePlannedForSplitTaskBefore = blockedBlock.start - viewEntryForSplitTask.time;
      timePlannedForSplitTaskContinued = timeLeftForCompleteSplitTask - timePlannedForSplitTaskBefore;
      viewEntryForSplitTask.type = TimelineViewEntryType.SplitTask;

      viewEntriesToAdd.push({
        id: i + '_' + (splitTask as TaskWithoutReminder).id,
        time: blockedBlock.end,
        type: TimelineViewEntryType.SplitTaskContinued,
        data: {
          title: (splitTask as TaskWithoutReminder).title,
          timeToGo: timePlannedForSplitTaskContinued,
        },
        isHideTime: false,
      });
    }

    if (viewEntryForSplitTask) {
      const blockedBlockDuration = blockedBlock.end - blockedBlock.start;
      viewEntriesForUnScheduled.forEach(viewEntry => {
        if (viewEntry.time > blockedBlock.start && viewEntry !== viewEntryForSplitTask) {
          viewEntry.time = viewEntry.time + blockedBlockDuration;
        }
      });
    }

    // add entries
    viewEntries.splice(viewEntries.length, 0, ...viewEntriesToAdd);
  });
};

const resortTasksWithCurrentFirst = (currentId: string, tasks: Task[]): Task[] => {
  let newTasks = tasks;
  const currentTask = tasks.find(t => t.id === currentId);
  if (currentTask) {
    newTasks = [currentTask, ...tasks.filter(t => t.id !== currentId)] as Task[];
  }
  return newTasks;
};

// const isTaskSplittableTaskType = (viewEntry: TimelineViewEntry): boolean => {
//   return viewEntry.type === TimelineViewEntryType.Task || viewEntry.type === TimelineViewEntryType.SplitTaskContinued;
// };

