!function(e){var t={};function n(s){if(t[s])return t[s].exports;var r=t[s]={i:s,l:!1,exports:{}};return e[s].call(r.exports,r,r.exports,n),r.l=!0,r.exports}n.m=e,n.c=t,n.d=function(e,t,s){n.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:s})},n.r=function(e){"undefined"!==typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},n.t=function(e,t){if(1&t&&(e=n(e)),8&t)return e;if(4&t&&"object"===typeof e&&e&&e.__esModule)return e;var s=Object.create(null);if(n.r(s),Object.defineProperty(s,"default",{enumerable:!0,value:e}),2&t&&"string"!=typeof e)for(var r in e)n.d(s,r,function(t){return e[t]}.bind(null,r));return s},n.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return n.d(t,"a",t),t},n.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},n.p="/course/",n(n.s=7)}([function(e,t,n){"use strict";try{self["workbox:core:5.1.4"]&&_()}catch(s){}},function(e,t,n){"use strict";try{self["workbox:precaching:5.1.4"]&&_()}catch(s){}},function(e,t,n){"use strict";try{self["workbox:routing:5.1.4"]&&_()}catch(s){}},function(e,t,n){"use strict";try{self["workbox:strategies:5.1.4"]&&_()}catch(s){}},function(e,t,n){"use strict";try{self["workbox:expiration:5.1.4"]&&_()}catch(s){}},function(e,t,n){"use strict";try{self["workbox:cacheable-response:5.1.4"]&&_()}catch(s){}},function(e,t,n){self,e.exports=(()=>{"use strict";var e={d:(t,n)=>{for(var s in n)e.o(n,s)&&!e.o(t,s)&&Object.defineProperty(t,s,{enumerable:!0,get:n[s]})},o:(e,t)=>Object.prototype.hasOwnProperty.call(e,t),r:e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})}},t={};e.r(t),e.d(t,{isServiceWorkerRequest:()=>i,serviceWorkerFetchListener:()=>o,asyncSleep:()=>a,ServiceWorkerError:()=>c,writeMessageAtomics:()=>u,writeMessageServiceWorker:()=>h,writeMessage:()=>l,makeChannel:()=>d,makeAtomicsChannel:()=>f,makeServiceWorkerChannel:()=>p,readMessage:()=>m,syncSleep:()=>y,uuidv4:()=>w});var n=function(e,t,n,s){return new(n||(n=Promise))((function(r,i){function o(e){try{c(s.next(e))}catch(e){i(e)}}function a(e){try{c(s.throw(e))}catch(e){i(e)}}function c(e){var t;e.done?r(e.value):(t=e.value,t instanceof n?t:new n((function(e){e(t)}))).then(o,a)}c((s=s.apply(e,t||[])).next())}))};const s="__SyncMessageServiceWorkerInput__",r="__sync-message-v2__";function i(e){return"string"!=typeof e&&(e=e.request.url),e.includes(s)}function o(){const e={},t={};return s=>{const{url:o}=s.request;return!!i(o)&&(s.respondWith(function(){return n(this,void 0,void 0,(function*(){function n(e){const t={message:e,version:r};return new Response(JSON.stringify(t),{status:200})}if(o.endsWith("/read")){const{messageId:r,timeout:i}=yield s.request.json(),o=e[r];return o?(delete e[r],n(o)):yield new Promise((e=>{t[r]=e,setTimeout((function(){delete t[r],e(new Response("",{status:408}))}),i)}))}if(o.endsWith("/write")){const{message:r,messageId:i}=yield s.request.json(),o=t[i];return o?(o(n(r)),delete t[i]):e[i]=r,n({early:!o})}if(o.endsWith("/version"))return new Response(r,{status:200})}))}()),!0)}}function a(e){return new Promise((t=>setTimeout(t,e)))}class c extends Error{constructor(e,t){super(`Received status ${t} from ${e}. Ensure the service worker is registered and active.`),this.url=e,this.status=t,this.type="ServiceWorkerError",Object.setPrototypeOf(this,c.prototype)}}function u(e,t){const n=(new TextEncoder).encode(JSON.stringify(t)),{data:s,meta:r}=e;if(n.length>s.length)throw new Error("Message is too big, increase bufferSize when making channel.");s.set(n,0),Atomics.store(r,0,n.length),Atomics.store(r,1,1),Atomics.notify(r,1)}function h(e,t,s){return n(this,void 0,void 0,(function*(){yield navigator.serviceWorker.ready;const n=e.baseUrl+"/write",i=Date.now();for(;;){const o={message:t,messageId:s},u=yield fetch(n,{method:"POST",body:JSON.stringify(o)});if(200===u.status&&(yield u.json()).version===r)return;if(!(Date.now()-i<e.timeout))throw new c(n,u.status);yield a(100)}}))}function l(e,t,s){return n(this,void 0,void 0,(function*(){"atomics"===e.type?u(e,t):yield h(e,t,s)}))}function d(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};return"undefined"!=typeof SharedArrayBuffer?f(e.atomics):"serviceWorker"in navigator?p(e.serviceWorker):null}function f(){let{bufferSize:e}=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};return{type:"atomics",data:new Uint8Array(new SharedArrayBuffer(e||131072)),meta:new Int32Array(new SharedArrayBuffer(2*Int32Array.BYTES_PER_ELEMENT))}}function p(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};return{type:"serviceWorker",baseUrl:(e.scope||"/")+s,timeout:e.timeout||5e3}}function g(e,t){return e>0?+e:t}function m(e,t){let{checkInterrupt:n,checkTimeout:s,timeout:i}=arguments.length>2&&void 0!==arguments[2]?arguments[2]:{};const o=performance.now();s=g(s,n?100:5e3);const a=g(i,Number.POSITIVE_INFINITY);let u;if("atomics"===e.type){const{data:t,meta:n}=e;u=()=>{if("timed-out"===Atomics.wait(n,1,0,s))return null;{const e=Atomics.exchange(n,0,0),s=t.slice(0,e);Atomics.store(n,1,0);const r=(new TextDecoder).decode(s);return JSON.parse(r)}}}else u=()=>{const n=new XMLHttpRequest,i=e.baseUrl+"/read";n.open("POST",i,!1);const a={messageId:t,timeout:s};n.send(JSON.stringify(a));const{status:u}=n;if(408===u)return null;if(200===u){const e=JSON.parse(n.responseText);return e.version!==r?null:e.message}if(performance.now()-o<e.timeout)return null;throw new c(i,u)};for(;;){const e=a-(performance.now()-o);if(e<=0)return null;s=Math.min(s,e);const t=u();if(null!==t)return t;if(null==n?void 0:n())return null}}function y(e,t){if(e=g(e,0))if("undefined"!=typeof SharedArrayBuffer){const t=new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));t[0]=0,Atomics.wait(t,0,0,e)}else m(t,`sleep ${e} ${w()}`,{timeout:e})}let w;return w="randomUUID"in crypto?function(){return crypto.randomUUID()}:function(){return"10000000-1000-4000-8000-100000000000".replace(/[018]/g,(e=>{const t=Number(e);return(t^crypto.getRandomValues(new Uint8Array(1))[0]&15>>t/4).toString(16)}))},t})()},function(e,t,n){"use strict";n.r(t);var s=n(6);n(0);const r=function(e){let t=e;for(var n=arguments.length,s=new Array(n>1?n-1:0),r=1;r<n;r++)s[r-1]=arguments[r];return s.length>0&&(t+=` :: ${JSON.stringify(s)}`),t};class i extends Error{constructor(e,t){super(r(e,t)),this.name=e,this.details=t}}const o=new Set;const a={googleAnalytics:"googleAnalytics",precache:"precache-v2",prefix:"workbox",runtime:"runtime",suffix:"undefined"!==typeof registration?registration.scope:""},c=e=>[a.prefix,e,a.suffix].filter((e=>e&&e.length>0)).join("-"),u=e=>e||c(a.precache),h=e=>e||c(a.runtime);const l=e=>new URL(String(e),location.href).href.replace(new RegExp(`^${location.origin}`),""),d=(e,t)=>e.filter((e=>t in e)),f=async e=>{let{request:t,mode:n,plugins:s=[]}=e;const r=d(s,"cacheKeyWillBeUsed");let i=t;for(const o of r)i=await o.cacheKeyWillBeUsed.call(o,{mode:n,request:i}),"string"===typeof i&&(i=new Request(i));return i},p=async e=>{let{cacheName:t,request:n,event:s,matchOptions:r,plugins:i=[]}=e;const o=await self.caches.open(t),a=await f({plugins:i,request:n,mode:"read"});let c=await o.match(a,r);for(const u of i)if("cachedResponseWillBeUsed"in u){const e=u.cachedResponseWillBeUsed;c=await e.call(u,{cacheName:t,event:s,matchOptions:r,cachedResponse:c,request:a})}return c},g=async e=>{let{cacheName:t,request:n,response:s,event:r,plugins:a=[],matchOptions:c}=e;const u=await f({plugins:a,request:n,mode:"write"});if(!s)throw new i("cache-put-with-no-response",{url:l(u.url)});const h=await(async e=>{let{request:t,response:n,event:s,plugins:r=[]}=e,i=n,o=!1;for(const a of r)if("cacheWillUpdate"in a){o=!0;const e=a.cacheWillUpdate;if(i=await e.call(a,{request:t,response:i,event:s}),!i)break}return o||(i=i&&200===i.status?i:void 0),i||null})({event:r,plugins:a,response:s,request:u});if(!h)return void 0;const g=await self.caches.open(t),m=d(a,"cacheDidUpdate"),y=m.length>0?await p({cacheName:t,matchOptions:c,request:u}):null;try{await g.put(u,h)}catch(w){throw"QuotaExceededError"===w.name&&await async function(){for(const e of o)await e()}(),w}for(const i of m)await i.cacheDidUpdate.call(i,{cacheName:t,event:r,oldResponse:y,newResponse:h,request:u})},m=p;let y;function w(e){e.then((()=>{}))}class _{constructor(e,t){let{onupgradeneeded:n,onversionchange:s}=arguments.length>2&&void 0!==arguments[2]?arguments[2]:{};this._db=null,this._name=e,this._version=t,this._onupgradeneeded=n,this._onversionchange=s||(()=>this.close())}get db(){return this._db}async open(){if(!this._db)return this._db=await new Promise(((e,t)=>{let n=!1;setTimeout((()=>{n=!0,t(new Error("The open request was blocked and timed out"))}),this.OPEN_TIMEOUT);const s=indexedDB.open(this._name,this._version);s.onerror=()=>t(s.error),s.onupgradeneeded=e=>{n?(s.transaction.abort(),s.result.close()):"function"===typeof this._onupgradeneeded&&this._onupgradeneeded(e)},s.onsuccess=()=>{const t=s.result;n?t.close():(t.onversionchange=this._onversionchange.bind(this),e(t))}})),this}async getKey(e,t){return(await this.getAllKeys(e,t,1))[0]}async getAll(e,t,n){return await this.getAllMatching(e,{query:t,count:n})}async getAllKeys(e,t,n){return(await this.getAllMatching(e,{query:t,count:n,includeKeys:!0})).map((e=>e.key))}async getAllMatching(e){let{index:t,query:n=null,direction:s="next",count:r,includeKeys:i=!1}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};return await this.transaction([e],"readonly",((o,a)=>{const c=o.objectStore(e),u=t?c.index(t):c,h=[],l=u.openCursor(n,s);l.onsuccess=()=>{const e=l.result;e?(h.push(i?e:e.value),r&&h.length>=r?a(h):e.continue()):a(h)}}))}async transaction(e,t,n){return await this.open(),await new Promise(((s,r)=>{const i=this._db.transaction(e,t);i.onabort=()=>r(i.error),i.oncomplete=()=>s(),n(i,(e=>s(e)))}))}async _call(e,t,n){for(var s=arguments.length,r=new Array(s>3?s-3:0),i=3;i<s;i++)r[i-3]=arguments[i];return await this.transaction([t],n,((n,s)=>{const i=n.objectStore(t),o=i[e].apply(i,r);o.onsuccess=()=>s(o.result)}))}close(){this._db&&(this._db.close(),this._db=null)}}_.prototype.OPEN_TIMEOUT=2e3;const v={readonly:["get","count","getKey","getAll","getAllKeys"],readwrite:["add","put","clear","delete"]};for(const[Q,X]of Object.entries(v))for(const e of X)e in IDBObjectStore.prototype&&(_.prototype[e]=async function(t){for(var n=arguments.length,s=new Array(n>1?n-1:0),r=1;r<n;r++)s[r-1]=arguments[r];return await this._call(e,t,Q,...s)});const R=async e=>{let{request:t,fetchOptions:n,event:s,plugins:r=[]}=e;if("string"===typeof t&&(t=new Request(t)),s instanceof FetchEvent&&s.preloadResponse){const e=await s.preloadResponse;if(e)return e}const o=d(r,"fetchDidFail"),a=o.length>0?t.clone():null;try{for(const e of r)if("requestWillFetch"in e){const n=e.requestWillFetch,r=t.clone();t=await n.call(e,{request:r,event:s})}}catch(u){throw new i("plugin-error-request-will-fetch",{thrownError:u})}const c=t.clone();try{let e;e="navigate"===t.mode?await fetch(t):await fetch(t,n);for(const t of r)"fetchDidSucceed"in t&&(e=await t.fetchDidSucceed.call(t,{event:s,request:c,response:e}));return e}catch(h){0;for(const e of o)await e.fetchDidFail.call(e,{error:h,event:s,originalRequest:a.clone(),request:c.clone()});throw h}};async function b(e,t){const n=e.clone(),s={headers:new Headers(n.headers),status:n.status,statusText:n.statusText},r=t?t(s):s,i=function(){if(void 0===y){const t=new Response("");if("body"in t)try{new Response(t.body),y=!0}catch(e){y=!1}y=!1}return y}()?n.body:await n.blob();return new Response(i,r)}n(4);const x="cache-entries",E=e=>{const t=new URL(e,location.href);return t.hash="",t.href};class S{constructor(e){this._cacheName=e,this._db=new _("workbox-expiration",1,{onupgradeneeded:e=>this._handleUpgrade(e)})}_handleUpgrade(e){const t=e.target.result.createObjectStore(x,{keyPath:"id"});t.createIndex("cacheName","cacheName",{unique:!1}),t.createIndex("timestamp","timestamp",{unique:!1}),(async e=>{await new Promise(((t,n)=>{const s=indexedDB.deleteDatabase(e);s.onerror=()=>{n(s.error)},s.onblocked=()=>{n(new Error("Delete blocked"))},s.onsuccess=()=>{t()}}))})(this._cacheName)}async setTimestamp(e,t){const n={url:e=E(e),timestamp:t,cacheName:this._cacheName,id:this._getId(e)};await this._db.put(x,n)}async getTimestamp(e){return(await this._db.get(x,this._getId(e))).timestamp}async expireEntries(e,t){const n=await this._db.transaction(x,"readwrite",((n,s)=>{const r=n.objectStore(x).index("timestamp").openCursor(null,"prev"),i=[];let o=0;r.onsuccess=()=>{const n=r.result;if(n){const s=n.value;s.cacheName===this._cacheName&&(e&&s.timestamp<e||t&&o>=t?i.push(n.value):o++),n.continue()}else s(i)}})),s=[];for(const r of n)await this._db.delete(x,r.id),s.push(r.url);return s}_getId(e){return this._cacheName+"|"+E(e)}}class T{constructor(e){let t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};this._isRunning=!1,this._rerunRequested=!1,this._maxEntries=t.maxEntries,this._maxAgeSeconds=t.maxAgeSeconds,this._cacheName=e,this._timestampModel=new S(e)}async expireEntries(){if(this._isRunning)return void(this._rerunRequested=!0);this._isRunning=!0;const e=this._maxAgeSeconds?Date.now()-1e3*this._maxAgeSeconds:0,t=await this._timestampModel.expireEntries(e,this._maxEntries),n=await self.caches.open(this._cacheName);for(const s of t)await n.delete(s);this._isRunning=!1,this._rerunRequested&&(this._rerunRequested=!1,w(this.expireEntries()))}async updateTimestamp(e){await this._timestampModel.setTimestamp(e,Date.now())}async isURLExpired(e){if(this._maxAgeSeconds){return await this._timestampModel.getTimestamp(e)<Date.now()-1e3*this._maxAgeSeconds}return!1}async delete(){this._rerunRequested=!1,await this._timestampModel.expireEntries(1/0)}}class q{constructor(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};var t;this.cachedResponseWillBeUsed=async e=>{let{event:t,request:n,cacheName:s,cachedResponse:r}=e;if(!r)return null;const i=this._isResponseDateFresh(r),o=this._getCacheExpiration(s);w(o.expireEntries());const a=o.updateTimestamp(n.url);if(t)try{t.waitUntil(a)}catch(c){0}return i?r:null},this.cacheDidUpdate=async e=>{let{cacheName:t,request:n}=e;const s=this._getCacheExpiration(t);await s.updateTimestamp(n.url),await s.expireEntries()},this._config=e,this._maxAgeSeconds=e.maxAgeSeconds,this._cacheExpirations=new Map,e.purgeOnQuotaError&&(t=()=>this.deleteCacheAndMetadata(),o.add(t))}_getCacheExpiration(e){if(e===h())throw new i("expire-custom-caches-only");let t=this._cacheExpirations.get(e);return t||(t=new T(e,this._config),this._cacheExpirations.set(e,t)),t}_isResponseDateFresh(e){if(!this._maxAgeSeconds)return!0;const t=this._getDateHeaderTimestamp(e);if(null===t)return!0;return t>=Date.now()-1e3*this._maxAgeSeconds}_getDateHeaderTimestamp(e){if(!e.headers.has("date"))return null;const t=e.headers.get("date"),n=new Date(t).getTime();return isNaN(n)?null:n}async deleteCacheAndMetadata(){for(const[e,t]of this._cacheExpirations)await self.caches.delete(e),await t.delete();this._cacheExpirations=new Map}}n(1);const U=[],A={get:()=>U,add(e){U.push(...e)}};function N(e){if(!e)throw new i("add-to-cache-list-unexpected-type",{entry:e});if("string"===typeof e){const t=new URL(e,location.href);return{cacheKey:t.href,url:t.href}}const{revision:t,url:n}=e;if(!n)throw new i("add-to-cache-list-unexpected-type",{entry:e});if(!t){const e=new URL(n,location.href);return{cacheKey:e.href,url:e.href}}const s=new URL(n,location.href),r=new URL(n,location.href);return s.searchParams.set("__WB_REVISION__",t),{cacheKey:s.href,url:r.href}}class O{constructor(e){this._cacheName=u(e),this._urlsToCacheKeys=new Map,this._urlsToCacheModes=new Map,this._cacheKeysToIntegrities=new Map}addToCacheList(e){const t=[];for(const n of e){"string"===typeof n?t.push(n):n&&void 0===n.revision&&t.push(n.url);const{cacheKey:e,url:s}=N(n),r="string"!==typeof n&&n.revision?"reload":"default";if(this._urlsToCacheKeys.has(s)&&this._urlsToCacheKeys.get(s)!==e)throw new i("add-to-cache-list-conflicting-entries",{firstEntry:this._urlsToCacheKeys.get(s),secondEntry:e});if("string"!==typeof n&&n.integrity){if(this._cacheKeysToIntegrities.has(e)&&this._cacheKeysToIntegrities.get(e)!==n.integrity)throw new i("add-to-cache-list-conflicting-integrities",{url:s});this._cacheKeysToIntegrities.set(e,n.integrity)}if(this._urlsToCacheKeys.set(s,e),this._urlsToCacheModes.set(s,r),t.length>0){const e=`Workbox is precaching URLs without revision info: ${t.join(", ")}\nThis is generally NOT safe. Learn more at https://bit.ly/wb-precache`;console.warn(e)}}}async install(){let{event:e,plugins:t}=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};const n=[],s=[],r=await self.caches.open(this._cacheName),i=await r.keys(),o=new Set(i.map((e=>e.url)));for(const[c,u]of this._urlsToCacheKeys)o.has(u)?s.push(c):n.push({cacheKey:u,url:c});const a=n.map((n=>{let{cacheKey:s,url:r}=n;const i=this._cacheKeysToIntegrities.get(s),o=this._urlsToCacheModes.get(r);return this._addURLToCache({cacheKey:s,cacheMode:o,event:e,integrity:i,plugins:t,url:r})}));await Promise.all(a);return{updatedURLs:n.map((e=>e.url)),notUpdatedURLs:s}}async activate(){const e=await self.caches.open(this._cacheName),t=await e.keys(),n=new Set(this._urlsToCacheKeys.values()),s=[];for(const r of t)n.has(r.url)||(await e.delete(r),s.push(r.url));return{deletedURLs:s}}async _addURLToCache(e){let{cacheKey:t,url:n,cacheMode:s,event:r,plugins:o,integrity:a}=e;const c=new Request(n,{integrity:a,cache:s,credentials:"same-origin"});let u,h=await R({event:r,plugins:o,request:c});for(const i of o||[])"cacheWillUpdate"in i&&(u=i);if(!(u?await u.cacheWillUpdate({event:r,request:c,response:h}):h.status<400))throw new i("bad-precaching-response",{url:n,status:h.status});h.redirected&&(h=await b(h)),await g({event:r,plugins:o,response:h,request:t===n?c:new Request(t),cacheName:this._cacheName,matchOptions:{ignoreSearch:!0}})}getURLsToCacheKeys(){return this._urlsToCacheKeys}getCachedURLs(){return[...this._urlsToCacheKeys.keys()]}getCacheKeyForURL(e){const t=new URL(e,location.href);return this._urlsToCacheKeys.get(t.href)}async matchPrecache(e){const t=e instanceof Request?e.url:e,n=this.getCacheKeyForURL(t);if(n){return(await self.caches.open(this._cacheName)).match(n)}}createHandler(){let e=!(arguments.length>0&&void 0!==arguments[0])||arguments[0];return async t=>{let{request:n}=t;try{const e=await this.matchPrecache(n);if(e)return e;throw new i("missing-precache-entry",{cacheName:this._cacheName,url:n instanceof Request?n.url:n})}catch(s){if(e)return fetch(n);throw s}}}createHandlerBoundToURL(e){let t=!(arguments.length>1&&void 0!==arguments[1])||arguments[1];if(!this.getCacheKeyForURL(e))throw new i("non-precached-url",{url:e});const n=this.createHandler(t),s=new Request(e);return()=>n({request:s})}}let L;const C=()=>(L||(L=new O),L);function M(e){let t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:[];for(const n of[...e.searchParams.keys()])t.some((e=>e.test(n)))&&e.searchParams.delete(n);return e}const P=(e,t)=>{const n=C().getURLsToCacheKeys();for(const s of function(e){let{ignoreURLParametersMatching:t,directoryIndex:n,cleanURLs:s,urlManipulation:r}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};return function*(){const i=new URL(e,location.href);i.hash="",yield i.href;const o=M(i,t);if(yield o.href,n&&o.pathname.endsWith("/")){const e=new URL(o.href);e.pathname+=n,yield e.href}if(s){const e=new URL(o.href);e.pathname+=".html",yield e.href}if(r){const e=r({url:i});for(const t of e)yield t.href}}()}(e,t)){const e=n.get(s);if(e)return e}};let W=!1;function k(e){W||(!function(){let{ignoreURLParametersMatching:e=[/^utm_/],directoryIndex:t="index.html",cleanURLs:n=!0,urlManipulation:s}=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};const r=u();self.addEventListener("fetch",(i=>{const o=P(i.request.url,{cleanURLs:n,directoryIndex:t,ignoreURLParametersMatching:e,urlManipulation:s});if(!o)return;let a=self.caches.open(r).then((e=>e.match(o))).then((e=>e||fetch(o)));i.respondWith(a)}))}(e),W=!0)}const I=e=>{const t=C(),n=A.get();e.waitUntil(t.install({event:e,plugins:n}).catch((e=>{throw e})))},K=e=>{const t=C();e.waitUntil(t.activate())};n(2);const D=e=>e&&"object"===typeof e?e:{handle:e};class j{constructor(e,t){let n=arguments.length>2&&void 0!==arguments[2]?arguments[2]:"GET";this.handler=D(t),this.match=e,this.method=n}}class B extends j{constructor(e,t,n){super((t=>{let{url:n}=t;const s=e.exec(n.href);if(s&&(n.origin===location.origin||0===s.index))return s.slice(1)}),t,n)}}class F{constructor(){this._routes=new Map}get routes(){return this._routes}addFetchListener(){self.addEventListener("fetch",(e=>{const{request:t}=e,n=this.handleRequest({request:t,event:e});n&&e.respondWith(n)}))}addCacheListener(){self.addEventListener("message",(e=>{if(e.data&&"CACHE_URLS"===e.data.type){const{payload:t}=e.data;0;const n=Promise.all(t.urlsToCache.map((e=>{"string"===typeof e&&(e=[e]);const t=new Request(...e);return this.handleRequest({request:t})})));e.waitUntil(n),e.ports&&e.ports[0]&&n.then((()=>e.ports[0].postMessage(!0)))}}))}handleRequest(e){let{request:t,event:n}=e;const s=new URL(t.url,location.href);if(!s.protocol.startsWith("http"))return void 0;const{params:r,route:i}=this.findMatchingRoute({url:s,request:t,event:n});let o=i&&i.handler;if(!o&&this._defaultHandler&&(o=this._defaultHandler),!o)return void 0;let a;try{a=o.handle({url:s,request:t,event:n,params:r})}catch(c){a=Promise.reject(c)}return a instanceof Promise&&this._catchHandler&&(a=a.catch((e=>this._catchHandler.handle({url:s,request:t,event:n})))),a}findMatchingRoute(e){let{url:t,request:n,event:s}=e;const r=this._routes.get(n.method)||[];for(const i of r){let e;const r=i.match({url:t,request:n,event:s});if(r)return e=r,(Array.isArray(r)&&0===r.length||r.constructor===Object&&0===Object.keys(r).length||"boolean"===typeof r)&&(e=void 0),{route:i,params:e}}return{}}setDefaultHandler(e){this._defaultHandler=D(e)}setCatchHandler(e){this._catchHandler=D(e)}registerRoute(e){this._routes.has(e.method)||this._routes.set(e.method,[]),this._routes.get(e.method).push(e)}unregisterRoute(e){if(!this._routes.has(e.method))throw new i("unregister-route-but-not-found-with-method",{method:e.method});const t=this._routes.get(e.method).indexOf(e);if(!(t>-1))throw new i("unregister-route-route-not-registered");this._routes.get(e.method).splice(t,1)}}let H;const J=()=>(H||(H=new F,H.addFetchListener(),H.addCacheListener()),H);n(3);const $={cacheWillUpdate:async e=>{let{response:t}=e;return 200===t.status||0===t.status?t:null}};class V{constructor(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};if(this._cacheName=h(e.cacheName),this._plugins=e.plugins||[],e.plugins){const t=e.plugins.some((e=>!!e.cacheWillUpdate));this._plugins=t?e.plugins:[$,...e.plugins]}else this._plugins=[$];this._fetchOptions=e.fetchOptions,this._matchOptions=e.matchOptions}async handle(e){let{event:t,request:n}=e;"string"===typeof n&&(n=new Request(n));const s=this._getFromNetwork({request:n,event:t});let r,o=await m({cacheName:this._cacheName,request:n,event:t,matchOptions:this._matchOptions,plugins:this._plugins});if(o){if(t)try{t.waitUntil(s)}catch(r){0}}else{0;try{o=await s}catch(a){r=a}}if(!o)throw new i("no-response",{url:n.url,error:r});return o}async _getFromNetwork(e){let{request:t,event:n}=e;const s=await R({request:t,event:n,fetchOptions:this._fetchOptions,plugins:this._plugins}),r=g({cacheName:this._cacheName,request:t,response:s.clone(),event:n,plugins:this._plugins});if(n)try{n.waitUntil(r)}catch(i){0}return s}}var Y;n(5);class z{constructor(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};this._statuses=e.statuses,this._headers=e.headers}isResponseCacheable(e){let t=!0;return this._statuses&&(t=this._statuses.includes(e.status)),this._headers&&t&&(t=Object.keys(this._headers).some((t=>e.headers.get(t)===this._headers[t]))),t}}class G{constructor(e){this.cacheWillUpdate=async e=>{let{response:t}=e;return this._cacheableResponse.isResponseCacheable(t)?t:null},this._cacheableResponse=new z(e)}}addEventListener("fetch",Object(s.serviceWorkerFetchListener)()),self.addEventListener("activate",(()=>self.clients.claim())),self.addEventListener("install",(()=>self.skipWaiting())),Object({NODE_ENV:"production",PUBLIC_URL:"/course",WDS_SOCKET_HOST:void 0,WDS_SOCKET_PATH:void 0,WDS_SOCKET_PORT:void 0,FAST_REFRESH:!0,REACT_APP_DISABLE_LOGIN:"1",REACT_APP_DISABLE_FIREBASE:"1"}).REACT_APP_PRECACHE&&(function(e){C().addToCacheList(e),e.length>0&&(self.addEventListener("install",I),self.addEventListener("activate",K))}([{'revision':'f9b3616b55f41909d110da7f6c836c3a','url':'/course/index.html'},{'revision':null,'url':'/course/static/css/2.1a91e2ac.chunk.css'},{'revision':null,'url':'/course/static/css/main.4de1a23b.chunk.css'},{'revision':null,'url':'/course/static/js/2.50a3d0ae.chunk.js'},{'revision':null,'url':'/course/static/js/Worker.9135dd84.worker.js'},{'revision':null,'url':'/course/static/js/main.3f9eadfb.chunk.js'},{'revision':null,'url':'/course/static/js/runtime-main.47a3726d.js'},{'revision':null,'url':'/course/static/media/language.01e98581.png'},{'revision':null,'url':'/course/static/media/pages.json.5e48284b.load_by_url'},{'revision':null,'url':'/course/static/media/python_core.tar.52c987ef.load_by_url'}]),k(Y),function(e,t,n){let s;if("string"===typeof e){const r=new URL(e,location.href);s=new j((e=>{let{url:t}=e;return t.href===r.href}),t,n)}else if(e instanceof RegExp)s=new B(e,t,n);else if("function"===typeof e)s=new j(e,t,n);else{if(!(e instanceof j))throw new i("unsupported-route-type",{moduleName:"workbox-routing",funcName:"registerRoute",paramName:"capture"});s=e}J().registerRoute(s)}((e=>{let{url:t}=e;const n=t.toString();return n.startsWith("https://cdn.jsdelivr.net/")||n.startsWith("https://pyodide-cdn2.iodide.io")||n.startsWith("https://futurecoder-io--")||t.hostname.endsWith("futurecoder.io")||t.hostname.includes("localhost")||t.hostname.includes("127.0.0.1")}),new V({cacheName:"everything",plugins:[new q({maxEntries:30}),new G({statuses:[0,200]})]})))}]);
//# sourceMappingURL=service-worker.js.map