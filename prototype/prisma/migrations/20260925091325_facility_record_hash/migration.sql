/*
  Warnings:

  - Added the required column `recordHash` to the `Facility` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Facility" ADD COLUMN     "recordHash" TEXT NOT NULL;
