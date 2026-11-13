const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const source = readFileSync(path.join(__dirname, 'backend-api.js'), 'utf8');
const backendApiModule = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

async function withGlobals(values, run) {
  const originalDescriptors = new Map();
  for (const [key, value] of Object.entries(values)) {
    originalDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  try {
    await run();
  } finally {
    for (const [key, descriptor] of originalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('login persists its token and sends it with authenticated requests', async () => {
  const { backendApi } = await backendApiModule;
  const values = new Map();
  const calls = [];
  const localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const responses = [
    new Response(JSON.stringify({ token: 'session-token', user: { id: 'user-1' } }), {
      headers: { 'content-type': 'application/json' }
    }),
    new Response(JSON.stringify({ user: { id: 'user-1' } }), {
      headers: { 'content-type': 'application/json' }
    })
  ];

  await withGlobals({
    localStorage,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return responses.shift();
    }
  }, async () => {
    assert.deepEqual(await backendApi.login('user@example.test', 'secret'), { id: 'user-1' });
    assert.deepEqual(await backendApi.getCurrentUser(), { id: 'user-1' });
  });

  assert.equal(values.get('agrogis_api_token_v1'), 'session-token');
  assert.equal(calls[0].options.headers.get('content-type'), 'application/json');
  assert.equal(calls[1].options.headers.get('authorization'), 'Bearer session-token');
});

test('logout clears the token after a bodyless 204 response without a content-type header', async () => {
  const { backendApi } = await backendApiModule;
  const values = new Map([['agrogis_api_token_v1', 'session-token']]);

  await withGlobals({
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    },
    fetch: async (_url, options) => {
      assert.equal(options.headers.has('content-type'), false);
      return new Response(null, { status: 204 });
    }
  }, () => backendApi.logout());

  assert.equal(values.has('agrogis_api_token_v1'), false);
});

test('logout clears the token even when the API rejects the request', async () => {
  const { backendApi } = await backendApiModule;
  const values = new Map([['agrogis_api_token_v1', 'session-token']]);

  await withGlobals({
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    },
    fetch: async () => new Response(JSON.stringify({ error: 'SERVICE_UNAVAILABLE' }), {
      status: 503,
      headers: { 'content-type': 'application/json' }
    })
  }, async () => {
    await assert.rejects(backendApi.logout(), error => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'SERVICE_UNAVAILABLE');
      return true;
    });
  });

  assert.equal(values.has('agrogis_api_token_v1'), false);
});

test('updateCurrentUser sends a PATCH with JSON body and returns the user', async () => {
  const { backendApi } = await backendApiModule;
  const values = new Map([['agrogis_api_token_v1', 'session-token']]);
  let seen;

  await withGlobals({
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    },
    fetch: async (url, options) => {
      seen = { url, options };
      return new Response(JSON.stringify({ user: { id: 'user-1', lpisId: 'LPIS-1' } }), {
        headers: { 'content-type': 'application/json' }
      });
    }
  }, async () => {
    const user = await backendApi.updateCurrentUser({ name: 'Farmer', lpisId: 'LPIS-1' });
    assert.deepEqual(user, { id: 'user-1', lpisId: 'LPIS-1' });
  });

  assert.ok(seen.url.endsWith('/users/me'));
  assert.equal(seen.options.method, 'PATCH');
  assert.equal(seen.options.headers.get('content-type'), 'application/json');
  assert.equal(seen.options.headers.get('authorization'), 'Bearer session-token');
  assert.deepEqual(JSON.parse(seen.options.body), { name: 'Farmer', lpisId: 'LPIS-1' });
});

test('deleteCurrentUser issues DELETE and clears the token even when the request fails', async () => {
  const { backendApi } = await backendApiModule;
  const values = new Map([['agrogis_api_token_v1', 'session-token']]);
  let method;

  await withGlobals({
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    },
    fetch: async (_url, options) => {
      method = options.method;
      return new Response(JSON.stringify({ error: 'SERVICE_UNAVAILABLE' }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      });
    }
  }, async () => {
    await assert.rejects(backendApi.deleteCurrentUser(), error => error.status === 503);
  });

  assert.equal(method, 'DELETE');
  assert.equal(values.has('agrogis_api_token_v1'), false);
});

test('getLpisParcels encodes the LPIS id and returns the parcel list', async () => {
  const { backendApi } = await backendApiModule;
  const seenUrls = [];

  await withGlobals({
    fetch: async (url) => {
      seenUrls.push(url);
      return new Response(JSON.stringify({ success: true, source: 'local', parcels: [{ externalRegisterId: 'LPIS-1' }] }), {
        headers: { 'content-type': 'application/json' }
      });
    }
  }, async () => {
    assert.deepEqual(await backendApi.getLpisParcels('FARM 7/1'), [{ externalRegisterId: 'LPIS-1' }]);
    assert.deepEqual(await backendApi.getLpisParcels(), [{ externalRegisterId: 'LPIS-1' }]);
  });

  assert.equal(seenUrls[0], 'https://agrogis-app.onrender.com/api/registry/lpis?lpisId=FARM%207%2F1');
  assert.equal(seenUrls[1], 'https://agrogis-app.onrender.com/api/registry/lpis');
});

test('API base is same-origin off GitHub Pages and the Render API on Pages', async () => {
  const loadModule = () => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Math.random()}`);

  let mod;
  await withGlobals({
    location: { protocol: 'https:', origin: 'https://agrogis.example.sk', hostname: 'agrogis.example.sk', search: '' }
  }, async () => {
    mod = await loadModule();
  });

  const urls = [];
  await withGlobals({
    location: { protocol: 'https:', origin: 'https://agrogis.example.sk', hostname: 'agrogis.example.sk', search: '' },
    fetch: async (url) => {
      urls.push(url);
      return new Response(JSON.stringify({ parcels: [] }), { headers: { 'content-type': 'application/json' } });
    }
  }, () => mod.backendApi.getLpisParcels());
  assert.equal(urls[0], 'https://agrogis.example.sk/api/registry/lpis');
});

test('malformed API JSON fails explicitly with the response status', async () => {
  const { backendApi } = await backendApiModule;
  await withGlobals({
    fetch: async () => new Response('{invalid', {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }, async () => {
    await assert.rejects(backendApi.searchEntities('farm'), err => {
      assert.equal(err.status, 200);
      assert.equal(err.code, 'INVALID_RESPONSE');
      assert.match(err.message, /Invalid JSON response/);
      return true;
    });
  });
});
