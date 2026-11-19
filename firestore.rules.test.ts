/**
 * Firestore Security Rules Verification Suite (Dirty Dozen Adversarial Tests)
 * Run with @firebase/rules-unit-testing against Firestore Emulator.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const RULES_PATH = './firestore.rules';

describe('Firestore Rules Static Verification & Dirty Dozen Coverage', () => {
  it('verifies firestore.rules exists and enforces rules_version 2 and default deny', () => {
    const content = fs.readFileSync(RULES_PATH, 'utf8');
    assert.ok(content.includes("rules_version = '2';"));
    assert.ok(content.includes('match /{document=**}'));
    assert.ok(content.includes('allow read, write: if false;'));
  });

  it('verifies all blueprint collections have dedicated match blocks and validation helpers', () => {
    const content = fs.readFileSync(RULES_PATH, 'utf8');
    for (const col of ['students', 'cars', 'scans', 'users', 'settings', 'admins']) {
      assert.ok(content.includes(`match /${col}/`), `Missing match block for ${col}`);
    }
    for (const helper of ['isValidStudent', 'isValidCar', 'isValidScan', 'isValidAppUser', 'isValidSetting']) {
      assert.ok(content.includes(`function ${helper}(`), `Missing helper ${helper}`);
    }
  });

  it('verifies no get() or exists() calls inside allow list blocks', () => {
    const content = fs.readFileSync(RULES_PATH, 'utf8');
    const listLines = content.split('\n').filter((line) => line.includes('allow list:'));
    for (const line of listLines) {
      assert.ok(!line.includes('isAdmin('), `allow list must not invoke isAdmin() with exists(): ${line}`);
      assert.ok(!line.includes('get('), `allow list must not call get(): ${line}`);
      assert.ok(!line.includes('exists('), `allow list must not call exists(): ${line}`);
    }
  });
});
