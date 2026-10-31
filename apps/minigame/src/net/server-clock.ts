// Countdown display follows the snapshot's server clock, not the phone's clock.
export class ServerClock {
  private offset=0;
  accept(serverTime:string|undefined,receivedAt=Date.now()):void {
    const timestamp=serverTime?Date.parse(serverTime):NaN;
    if(Number.isFinite(timestamp))this.offset=timestamp-receivedAt;
  }
  now(localNow=Date.now()):number {return localNow+this.offset;}
}
