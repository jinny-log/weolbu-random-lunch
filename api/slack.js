module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const payload = req.body;
        
        if (payload.imageBase64) {
            const base64Data = payload.imageBase64.replace(/^data:image\/png;base64,/, "");
            const bufferFile = Buffer.from(base64Data, 'base64');
            const fileLength = bufferFile.length;
            
            // Step 1: Get Upload URL
            const urlRes = await fetch(`https://slack.com/api/files.getUploadURLExternal?filename=lunch_groups.png&length=${fileLength}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${payload.token}` }
            });
            const urlData = await urlRes.json();
            if (!urlData.ok) {
                console.error('Slack API getUploadURL Error:', urlData);
                return res.status(400).json({ error: 'getUploadURL failed: ' + urlData.error });
            }
            
            const uploadUrl = urlData.upload_url;
            const fileId = urlData.file_id;
            
            // Step 2: Upload File Bytes
            const uploadRes = await fetch(uploadUrl, {
                method: 'POST',
                body: bufferFile
            });
            if (!uploadRes.ok) {
                return res.status(400).json({ error: 'Upload to URL failed' });
            }
            
            // Step 3: Complete Upload
            const completeRes = await fetch('https://slack.com/api/files.completeUploadExternal', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${payload.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: [{ id: fileId, title: "이번 주 조 편성 표" }],
                    channel_id: payload.channel,
                    thread_ts: payload.thread_ts || undefined,
                    initial_comment: payload.text || '조 편성 결과 표 이미지 안내드립니다.'
                })
            });
            
            const completeData = await completeRes.json();
            if (completeData.ok) return res.status(200).json({ success: true });
            
            console.error('Slack API Complete UPLOAD Error:', completeData);
            return res.status(400).json({ error: completeData.error });
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
