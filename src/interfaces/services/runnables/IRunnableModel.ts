import TaskTypes from "../../../enums/TaskTypes";

export default interface IRunnableModel {
    name: string;
    type: TaskTypes;

    time: string | null;
    date: string | null;
    expression: string | null;

    nextRun: Date | null;
    lastRun: Date | null;
    lastError: string | null;
    retryCount: number;

    enabled: boolean;
    isRunning: boolean;
}
