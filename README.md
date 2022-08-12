# Cloudflare Worker Deadman Switch

This repository uses [cloudflare workers](https://developers.cloudflare.com/workers/) to implement a quick and simple external healthcheck for your existing monitoring system. It send's you a notification via [pushover.net](https://pushover.net) whenever your monitor looses it's ability to ping an external service long enough.

The idea is that your monitor, i.e. a [prometheus](https://prometheus.io) instance, pings the cloudflare worker at a regular interval via HTTP.
A worker then listens for those pings and stores a timestamp for the most recent one in cloudflares kv store, while 
a cron job regularily checks whether the last ping has been received up to TOLERANCE_SECONDS ago and sends a
notification if not.

The default configuration should stay well below the [limits](https://developers.cloudflare.com/workers/platform/limits/) of a free plan, but please check for yourself - no warranties of any kind are provided.

## Setup & Usage

* Clone this repository.
* Install nodejs & run `npm install`, or install [wrangler](https://developers.cloudflare.com/workers/wrangler/get-started/) with another method.
* Login to cloudflare with `npx wrangler login`.
* Configure your instance in `wrangler.toml`.
* Create a KV store by running:

``` shellsession
npx wrangler kv:namespace create deadman_switch
```

* Create the necessary secrets by running:

``` shellsession 
echo "$redacted" | npx wrangler secret put PUSHOVER_API_TOKEN
echo "$redacted" | npx wrangler secret put PUSHOVER_USER_KEY
echo "$redacted" | npx wrangler secret put PING_TOKEN
```

* Deploy your instance:

``` shellsession
npx wrangler publish
# optionally, follow its log with: npx wrangler tail
```

* Configure your monitor to regularily ping the worker
  and pass ping_token as a query parameter. E.g.:

``` shellsession
curl "https://cloudflare-deadman-switch.$MY_DOMAIN/?ping_token=$PING_TOKEN"
```

## Example: Prometheus setup.

* Add an alert which always fires to prometheus `rules.yaml`:

``` yaml
groups:
- name: prometheus
  rules:
  - alert: PrometheusAlertmanagerE2eDeadManSwitch
    expr: vector(1)
    for: 0m
    labels:
      severity: critical
    annotations:
      summary: Prometheus AlertManager E2E dead man switch (instance {{ $labels.instance }})
      description: "Prometheus DeadManSwitch is an always-firing alert. It's used as an end-to-end test of Prometheus through the Alertmanager.\n  VALUE = {{ $value }}\n  LABELS: {{ $labels }}"
```

* Tell alertmanager to send those to your worker in `alertmanager.yaml`:

``` yaml
route:
  - receiver: deadman_switch
    match:
      alertname: 'PrometheusAlertmanagerE2eDeadManSwitch'
      severity: 'critical'
receivers:
  - name: deadman_switch
    webhook_configs:
      - url: "https://cloudflare-deadman-switch.$MY_DOMAIN/?ping_token=$PING_TOKEN"
        send_resolved: false
        max_alerts: 1
```

* Enjoy! :tada:
