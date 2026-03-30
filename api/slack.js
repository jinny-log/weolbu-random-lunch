module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const payload = req.body;
        
        if (payload.imageBase64) {
            const base64Data = payload.imageBase64.replace(/^data:image\/png;base64,/, "");
            const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
            let bodyString = '';
            
            bodyString += `--${boundary}\r\nContent-Disposition: form-data; name="channels"\r\n\r\n${payload.channel}\r\n`;
            if (payload.thread_ts) {
                bodyString += `--${boundary}\r\nContent-Disposition: form-data; name="thread_ts"\r\n\r\n${payload.thread_ts}\r\n`;
            }
            bodyString += `--${boundary}\r\nContent-Disposition: form-data; name="initial_comment"\r\n\r\n${payload.text || '조 편성 결과 표 이미지입니다.'}\r\n`;
            bodyString += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="lunch.png"\r\nContent-Type: image/png\r\n\r\n`;

            const bufferPrefix = Buffer.from(bodyString, 'utf-8');
            const bufferFile = Buffer.from(base64Data, 'base64');
            const bufferPostfix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');

            const bodyBuffer = Buffer.concat([bufferPrefix, bufferFile, bufferPostfix]);

            const slackRes = await fetch('https://slack.com/api/files.upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${payload.token}`,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`
                },
                body: bodyBuffer
            });
            const data = await slackRes.json();
            if (data.ok) return res.status(200).json({ success: true });
            
            console.error('Slack API UPLOAD Error response:', data);
            return res.status(400).json({ error: data.error });
        } else {
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
            if (data.ok) return res.status(200).json({ success: true });
            console.error('Slack API MSG Error response:', data);
            return res.status(400).json({ error: data.error });
        }
    } catch (err) {
        console.error('Vercel API Error:', err);
        return res.status(500).json({ error: err.message });
    }
}
