#!/usr/bin/env node

import { constants, publicEncrypt } from 'node:crypto';

const RAGFLOW_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArq9XTUSeYr2+N1h3Afl/
z8Dse/2yD0ZGrKwx+EEEcdsBLca9Ynmx3nIB5obmLlSfmskLpBo0UACBmB5rEjBp
2Q2f3AG3Hjd4B+gNCG6BDaawuDlgANIhGnaTLrIqWrrcm4EMzJOnAOI1fgzJRsOO
UEfaS318Eq9OVO3apEyCCt0lOQK6PuksduOjVxtltDav+guVAA068NrPYmRNabVK
RNLJpL8w4D44sfth5RvZ3q9t+6RTArpEtc5sh5ChzvqPOzKGMXW83C95TxmXqpbK
6olN4RevSfVjEAgCydH6HN6OhtOQEcnrU97r9H0iZOWwbw3pVrZiUkuRD1R56Wzs
2wIDAQAB
-----END PUBLIC KEY-----`;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function required(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`Missing required argument: --${key}`);
  }
  return value;
}

function encryptPassword(password) {
  const encoded = Buffer.from(password, 'utf8').toString('base64');
  return publicEncrypt(
    {
      key: RAGFLOW_PUBLIC_KEY,
      padding: constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(encoded, 'utf8'),
  ).toString('base64');
}

async function request(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const raw = await response.json().catch(() => ({}));
  return {
    ok: response.ok && (typeof raw.code !== 'number' || raw.code === 0),
    status: response.status,
    headers: response.headers,
    raw,
  };
}

async function ensureUser(baseUrl, email, nickname, password) {
  const encryptedPassword = encryptPassword(password);
  const registerResult = await request(baseUrl, '/v1/user/register', {
    email,
    nickname,
    password: encryptedPassword,
  });

  const registerMessage = String(registerResult.raw?.message || '');
  const alreadyExists =
    registerResult.status === 409 ||
    /already exists|existed|exists|registered|duplicate/i.test(registerMessage);

  if (!registerResult.ok && !alreadyExists) {
    throw new Error(
      `Registration failed (${registerResult.status}): ${registerMessage || 'Unknown error'}`,
    );
  }

  const loginResult = await request(baseUrl, '/v1/user/login', {
    email,
    password: encryptedPassword,
  });

  if (!loginResult.ok) {
    const message = String(loginResult.raw?.message || 'Unknown error');
    throw new Error(`Login failed (${loginResult.status}): ${message}`);
  }

  const authorization =
    loginResult.headers.get('Authorization') ||
    `Bearer ${loginResult.raw?.data?.access_token || ''}`;

  return {
    created: registerResult.ok && !alreadyExists,
    existed: alreadyExists,
    email,
    nickname: loginResult.raw?.data?.nickname || nickname,
    authorization,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = required(args, 'base-url').replace(/\/+$/, '');
  const email = required(args, 'email');
  const nickname = required(args, 'nickname');
  const password = required(args, 'password');

  const result = await ensureUser(baseUrl, email, nickname, password);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
