-- Migration v8: FollowUp frequency fields

ALTER TABLE "FollowUp" ADD COLUMN IF NOT EXISTS "frequenciaDias" INTEGER;
ALTER TABLE "FollowUp" ADD COLUMN IF NOT EXISTS "ultimoContato" TIMESTAMP(3);
ALTER TABLE "FollowUp" ADD COLUMN IF NOT EXISTS "proximoContato" TIMESTAMP(3);
