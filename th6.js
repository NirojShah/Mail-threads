const Imap = require('imap');
const { simpleParser } = require('mailparser');

// Configuration
const imap = new Imap({
    user: 'niroj',
    password: '123456',
    host: '192.168.0.119',
    port: 143,
    tls: false
});

let messageIdToUID = new Map();
let fetchedMessageIds = new Set();

// Utility function to open the mailbox
function openInbox(callback) {
    imap.openBox('INBOX', false, callback);
}

// Fetch emails based on a list of message IDs
function fetchEmails(messageIds, callback) {
    if (messageIds.length === 0) {
        console.log('No message IDs to fetch');
        callback();
        return;
    }

    const uidsToFetch = [];
    messageIds.forEach(id => {
        if (messageIdToUID.has(id)) {
            uidsToFetch.push(messageIdToUID.get(id));
        }
    });

    if (uidsToFetch.length === 0) {
        console.log('No UIDs to fetch');
        callback();
        return;
    }

    const fetch = imap.fetch(uidsToFetch, { bodies: ['HEADER.FIELDS (FROM TO SUBJECT MESSAGE-ID BODY.PEEK[TEXT] BODY.PEEK[HTML]'] });

    fetch.on('message', function (msg) {
        msg.on('body', function (stream) {
            simpleParser(stream, async (err, parsed) => {
                if (err) {
                    console.error('Error parsing email:', err);
                    return;
                }

                console.log("-----------------------------------------------------");

                const mail = {
                    from: parsed.from.text,
                    to: parsed.to.text,
                    messageId: parsed.messageId,
                    references: Array.isArray(parsed.references) ? parsed.references.join(', ') : (parsed.references || ''),
                    inReplyTo: parsed.inReplyTo || '',
                    body: parsed.text,
                    html: parsed.html,
                    attachments: parsed.attachments.map(att => ({
                        filename: att.filename,
                        contentType: att.contentType,
                        contentDisposition: att.contentDisposition,
                        contentId: att.contentId
                    }))
                };

                console.log('Parsed email:', mail);
                fetchedMessageIds.add(parsed.messageId);

                // Recursively fetch related emails
                fetchRelatedEmails(parsed.messageId);
            });
        });
    });

    fetch.once('end', function () {
        console.log('Fetch ended');
        callback();
    });
}

// Fetch UIDs based on message ID
function fetchUIDsFromMessageIds(callback) {
    imap.search(['ALL'], function (err, results) {
        if (err) {
            console.error('Error searching emails:', err);
            return;
        }

        const fetch = imap.fetch(results, { bodies: ['HEADER.FIELDS (MESSAGE-ID)'], struct: true });

        fetch.on('message', function (msg, seqno) {
            msg.on('body', function (stream) {
                let header = '';

                stream.on('data', function (chunk) {
                    header += chunk.toString();
                });

                stream.on('end', function () {
                    const messageIdMatch = header.match(/Message-ID:\s*(.*)/i);
                    const messageId = messageIdMatch ? messageIdMatch[1].trim() : null;

                    if (messageId) {
                        messageIdToUID.set(messageId, seqno);
                    }
                });
            });
        });

        fetch.once('end', function () {
            callback();
        });
    });
}

// Fetch related emails recursively
async function fetchRelatedEmails(messageId) {
    if (fetchedMessageIds.has(messageId)) return; // Avoid re-fetching the same email

    const relatedMessageIds = [];

    await new Promise((resolve) => {
        fetchUIDsFromMessageIds(() => {
            imap.search(['ALL'], function (err, results) {
                if (err) {
                    console.error('Error searching emails:', err);
                    resolve();
                    return;
                }

                const fetch = imap.fetch(results, { bodies: ['HEADER.FIELDS (REFERENCES IN-REPLY-TO MESSAGE-ID)'], struct: true });

                fetch.on('message', function (msg) {
                    msg.on('body', function (stream) {
                        let header = '';

                        stream.on('data', function (chunk) {
                            header += chunk.toString();
                        });

                        stream.on('end', function () {
                            try {
                                const parsed = Imap.parseHeader(header);
                                const references = Array.isArray(parsed.references) ? parsed.references : [];
                                const inReplyTo = Array.isArray(parsed['in-reply-to']) ? parsed['in-reply-to'][0] : parsed['in-reply-to'] || '';
                                const messageIdHeader = Array.isArray(parsed['message-id']) ? parsed['message-id'][0] : parsed['message-id'] || '';

                                if (references.includes(messageId) || inReplyTo === messageId) {
                                    if (messageIdHeader && !fetchedMessageIds.has(messageIdHeader)) {
                                        relatedMessageIds.push(messageIdHeader);
                                    }
                                }
                            } catch (err) {
                                console.error('Error parsing header:', err);
                            }
                        });
                    });
                });

                fetch.once('end', function () {
                    resolve();
                });
            });
        });
    });

    if (relatedMessageIds.length > 0) {
        console.log('Found related emails:', relatedMessageIds);
        await fetchEmails(relatedMessageIds);
        // Continue fetching related emails for found emails
        for (const relatedMessageId of relatedMessageIds) {
            await fetchRelatedEmails(relatedMessageId);
        }
    }
}

// Connect to IMAP and start fetching
imap.once('ready', function () {
    openInbox(function (err) {
        if (err) {
            console.error('Error opening inbox:', err);
            return;
        }

        // Start fetching related emails
        fetchRelatedEmails('<6dbd362d-105d-48fe-9f69-19771e9899c9@qugates.in>', function () {
            console.log('Fetch ended');
            imap.end();
        });
    });
});

imap.once('error', function (err) {
    console.error('IMAP error:', err);
});

imap.once('end', function () {
    console.log('IMAP connection ended');
});

imap.connect();
