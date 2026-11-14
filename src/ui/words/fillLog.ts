/** A fill progress call is logged on the first and last call and when the tenth of the total changes. */
export function createFillLogGate(): (done: number, total: number) => boolean {
  let lastTenth = -1;
  return (done, total) => {
    const tenth = Math.floor((done * 10) / total);
    const log = done === 0 || done === total || tenth !== lastTenth;
    lastTenth = tenth;
    return log;
  };
}
