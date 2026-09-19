1\. Manual “Email summary” (recommended first step)

* In the UI (e.g. list header or account area): “Email out-of-stock items”.
* Calls a server API (e.g. POST /api/email/out-of-stock) with the active list id (or “all my lists”).
* Server loads the user’s lists from the DB, filters status = 'out\_of\_stock', builds the email body, sends via a   provider.



2\. Send always to itamark100@gmail.com + reutrutin@gmail.com



3\. Email content (template)

* Subject: Out of stock — \[date]
* Body: Plain text (and optional HTML) with:

&#x09;- Bulleted lines: name, quantity.

&#x09;- Empty case: Don't Send  any email.

&#x09;- Empty case: massage "Nothing out of stock".



4\. UX details

* Button label: “Email out-of-stock list”
* Toast / inline message: “Sent” or provider error surfaced generically (“Could not send; try later”).
* make the Toast / inline message disappear after 10 seconds.
* Everyone can click the button.



5\. Scope of the send

* Send only for one list at a time. Not multiple.



6\. Rate limit / spam protection

* The app can send only 1 email for an 1 hour per user + per list.
* When someone will try to send more than 1 email in 1 hour he will get a massage " “You can only send one email per hour".



7\. Logging / audit

* Don't need.



8\. API KEY email

* re\_VLXsh6QA\_3Y3AAHRkYGcXtxsAPYGDMJmD

