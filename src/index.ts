/**
 * - Run `wrangler dev --local` in your terminal to start a development server
 * - Run `curl "http://localhost:8787/cdn-cgi/mf/scheduled"` to trigger the scheduled event
 * - Go back to the console to see what your worker has logged
 * - Update the Cron trigger in wrangler.toml (see https://developers.cloudflare.com/workers/wrangler/configuration/#triggers)
 * - Run `wrangler publish --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/runtime-apis/scheduled-event/
 */

export interface Env {
	 deadman_switch: KvNamespace;
}

async function getLastPing(store: KvNamespace): Date | null {
	let last_ping = await store.get('last_ping_at')
	if (last_ping) {
		return new Date(last_ping)
	}
	return null
}

function secondsAgo(last_ping: Date, now: Date): Number {
	return (now - last_ping) / 1000
}

export default {
	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext
	): Promise<void> {
		const now = new Date()
		const last_ping = await getLastPing(env.deadman_switch)
		let message
		if (last_ping) {
			const seconds = secondsAgo(last_ping, now)
			const toleranceSeconds = parseInt(env.TOLERANCE_SECONDS)
			if (seconds <= toleranceSeconds) {
				console.debug(`Received last_ping ${seconds}s ago, which is less than the tolerance of ${toleranceSeconds}s.`)
				return
			}
			message = `Received last ping ${seconds}s seconds ago, which is more than the tolerance of ${toleranceSeconds}s.`
		} else {
			message = `Haven't receceived a ping yet, as of ${now}`
		}

		console.debug(message)
		const body = {
			token: env.PUSHOVER_API_TOKEN,
			user: env.PUSHOVER_USER_KEY,
			priority: 2, // Notifications of a dead monitor should be CRITICAL
			message,
		}
		await fetch("https://api.pushover.net/1/messages.json", {
			body: JSON.stringify(body),
			method: 'POST',
			headers: {'content-type': 'application/json;charset=UTF-8',},
		})
	},

	async fetch(
		request: Request,
		env: Env
	): Promise<Response> {
		const { searchParams } = new URL(request.url)
		const supplied_ping_token = searchParams.get('ping_token')
		if (supplied_ping_token !== env.PING_TOKEN) {
			return new Response('Received invalid PING_TOKEN.', { status: 401 })
		}

		const last_ping = await getLastPing(env.deadman_switch)
		const now = new Date()
		const seconds = secondsAgo(last_ping, now)

		await env.deadman_switch.put('last_ping_at', now.toString())

		if (last_ping) {
			return new Response(`Received last ping ${seconds}s ago, at ${last_ping.toString()}.`)
		} else {
			return new Response(`Received first ping at ${now.toString()}.`)
		}
	},

};
