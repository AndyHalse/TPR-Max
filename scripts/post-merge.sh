#!/bin/bash
set -e
npm install --prefer-offline
npm run db:push -- --force
