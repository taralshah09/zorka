-- D87: the weekly report card, stored with the check-in.
ALTER TABLE "checkins" ADD COLUMN     "report" JSONB;
