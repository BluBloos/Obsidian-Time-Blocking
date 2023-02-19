import moment from "moment";

export function CREATE_MOMENT(any? : any) {
  if (any === undefined) {
    return moment.utc();
  }
  if (any === null) return any;
  if (typeof any === 'string' ) {
    return moment(any).utc();
  }
  return moment.utc(any);
}

export function CREATE_MOMENT_LOCAL(any? : any) {
  if (any === undefined) {
    return moment();
  }
  if (any === null) return any;
  return moment(any);
}