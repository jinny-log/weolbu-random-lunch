module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const payload = req.body;
        const targetUrl = 'https://slack.com/api/chat.postMessage';

        const slackRes = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${payload.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                channel: payload.channel,
                thread_ts: payload.thread_ts,
                blocks: payload.blocks,
                text: payload.text || '조 편성 결과 알림'
            })
        });

        const data = await slackRes.json();
        if (data.ok) {
            return res.status(200).json({ success: true });
        } else {
            console.error('Slack API Error response:', data);
            return res.status(400).json({ error: data.error });
        }
    } catch (err) {
        console.error('Vercel API Error:', err);
        return res.status(500).json({ error: err.message });
    }
}
