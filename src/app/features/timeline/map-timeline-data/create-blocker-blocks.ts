import { TaskWithReminder } from '../../tasks/task.model';
import { BlockedBlock, BlockedBlockType, TimelineWorkStartEndCfg } from '../timeline.model';
import { getTimeLeftForTask } from '../../../util/get-time-left-for-task';

export const createBlockerBlocks = (
  scheduledTasks: TaskWithReminder[],
  workStartEndCfg?: TimelineWorkStartEndCfg,
): BlockedBlock[] => {

  const blockedBlocks: BlockedBlock[] = [];

  scheduledTasks.forEach(task => {
    const start = task.plannedAt;
    // const end = task.plannedAt + Math.max(getTimeLeftForTask(task), 1);
    const end = task.plannedAt + getTimeLeftForTask(task);

    let wasMerged = false;
    for (const blockedBlock of blockedBlocks) {
      if (isOverlappingBlock({start, end}, blockedBlock)) {
        blockedBlock.start = Math.min(start, blockedBlock.start);
        blockedBlock.end = Math.max(end, blockedBlock.end);
        blockedBlock.entries.push({
          start,
          end,
          type: BlockedBlockType.ScheduledTask,
          data: task,
        });
        wasMerged = true;
        break;
      }
    }
    if (!wasMerged) {
      blockedBlocks.push({
        start,
        end,
        entries: [{
          start,
          end,
          type: BlockedBlockType.ScheduledTask,
          data: task,
        }]
      });
    }
  });

  return blockedBlocks;
};

const isOverlappingBlock = ({start, end}: { start: number; end: number }, blockedBlock: BlockedBlock): boolean => {
  return (start >= blockedBlock.start && start <= blockedBlock.end) // start is between block
    || (end >= blockedBlock.start && end <= blockedBlock.end); // end is between block;
};

