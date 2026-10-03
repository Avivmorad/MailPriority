/** Client-safe mailbox counts. Keep this module free of server clients. */
export interface MailFigures {
  processed: number;
  actions: number;
  pending: number;
  forYou: number;
  ignored: number;
  important: number;
  closed: number;
  snoozed: number;
}
