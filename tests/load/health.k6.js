import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 }, // ramp up to 20 VUs
    { duration: '30s', target: 50 }, // stay at 50 VUs
    { duration: '10s', target: 0 },  // ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests must complete below 200ms
    http_req_failed: ['rate<0.01'],   // error rate under 1%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:5000';

export default function () {
  const res = http.get(`${BASE_URL}/health`);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'status ok': (r) => JSON.parse(r.body).status === 'ok',
  });

  sleep(1);
}
