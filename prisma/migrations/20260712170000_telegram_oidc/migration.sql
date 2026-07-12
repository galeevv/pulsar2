ALTER TABLE "LoginChallenge" ADD COLUMN "oidcStateHash" TEXT;
ALTER TABLE "LoginChallenge" ADD COLUMN "encryptedPayload" TEXT;

CREATE UNIQUE INDEX "LoginChallenge_oidcStateHash_key" ON "LoginChallenge"("oidcStateHash");
