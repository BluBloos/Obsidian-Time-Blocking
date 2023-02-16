import moment from "moment";

export function CREATE_MOMENT(any? : any) {
    if (any === undefined) {
      return moment.utc();
    }
    if (any === null) return any;
    return moment.utc(any);
  }