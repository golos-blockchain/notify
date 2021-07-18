#!/usr/bin/env python
from contextlib import suppress

from golos.steem import Steem
from golos.blockchain import Blockchain
from golos.post import Post
from golosbase.exceptions import PostDoesNotExist
from golosbase.storage import configStorage

import json
import os
import re
import sys
import tarantool
import time

SCOPES = {
    'total': 0,
    'feed': 1, # not used
    'reward': 2, # not used
    'send': 3,
    'mention': 4,
    'follow': 5, # not used
    'vote': 6, # not used
    'comment_reply': 7,
    'post_reply': 8, # not used, uses comment_reply
    'account_update': 9, # not used
    'message': 10,
    'receive': 11,
    'donate': 12,
    'reserved2': 13,
    'reserved3': 14,
    'reserved4': 15
}

# global variables
steem = None
tnt_server = None
steem_space = None
chain = None
processed_posts = {}

TARANTOOL_HOST = os.environ.get('TARANTOOL_HOST', '127.0.0.1')
NODE_URL = os.environ.get('NODE_URL', 'https://api.golos.id')

configStorage.__setitem__('nodes', NODE_URL)


def getPostKey(post):
    try:
        if not post['json_metadata']:
            return None

        return post.identifier
    except PostDoesNotExist:
        return None


def processMentions(text, op):
    mentions = re.findall('\@[\w\d.-]+', text)
    if (len(mentions) == 0):
        return

    for mention in set(mentions):
        if mention[1:] == op['author'] or mention[1:] == op['parent_author']:
            # don't notify on self-mentions
            # and don't notify mentions of parent_author (because it duplicates comment_reply)
            continue
        print('--- mention: ', op['author'], op['permlink'], mention, mention[1:])
        tnt_server.call(
            'notification_add',
            mention[1:],
            SCOPES['mention'],
            False,
            op,
            op['timestamp_prev']
        )

def processComment(op):
    comment_body = op['body']
    if not comment_body or comment_body.startswith('@@ '):
        return
    try:
        post = Post(op, steemd_instance=steem)
        op['_depth'] = post['depth']
    except PostDoesNotExist as err:
        print('Err update post', err)
        return

    pkey = getPostKey(post)
    print('post: ', pkey)
    if not pkey or pkey in processed_posts:
        return
    processed_posts[pkey] = True
    processMentions(comment_body, op)
    if op['parent_author']:
        if op['parent_author'] != op['author']:
            # no need to notify self of own comments
            tnt_server.call(
                'notification_add',
                op['parent_author'],
                SCOPES['comment_reply'],
                True,
                op,
                op['timestamp_prev']
            )


def processTransfer(op):
    if op['from'] == op['to']:
        return
    print("transfer", op['from'], op['to'])
    tnt_server.call(
        'notification_add',
        op['from'],
        SCOPES['send'],
        True,
        op,
        op['timestamp_prev']
    )
    tnt_server.call(
        'notification_add',
        op['to'],
        SCOPES['receive'],
        True,
        op,
        op['timestamp_prev']
    )

def processDonate(op):
    if op['from'] == op['to']:
        return
    print("donate", op['from'], op['to'])
    tnt_server.call(
        'notification_add',
        op['to'],
        SCOPES['donate'],
        True,
        op,
        op['timestamp_prev']
    )


def processMessage(op):
    op_json = json.loads(op['json'])
    if not isinstance(op_json, list):
        return
    if op_json[0] not in ['private_message', 'private_delete_message', 'private_mark_message']:
        return
    data = op_json[1]
    print(op_json[0], data['from'], data['to'])
    tnt_server.call(
        'notification_add',
        data['from'],
        SCOPES['message'],
        False,
        op_json,
        op['timestamp_prev']
    )
    tnt_server.call(
        'notification_add',
        data['to'],
        SCOPES['message'],
        op_json[0] == 'private_message' and True or False,
        op_json,
        op['timestamp_prev']
    )

def processOp(op_data):
    op_type = op_data['type']
    op = op_data

    if op_type == 'custom_json' and op['id'] == 'private_message':
        processMessage(op)

    if op_type == 'comment':
        processComment(op)

    if op_type.startswith('transfer') or op_type == 'claim':
        processTransfer(op)

    if op_type == 'donate':
        processDonate(op)


def run():
    last_block = chain.info()['head_block_number']
    last_block_id_res = steem_space.select('last_block_id')

    if len(last_block_id_res) != 0:
        last_block = last_block_id_res[0][1]
        print('last_block', last_block)
    else:
        steem_space.insert(('last_block_id', last_block))

    #last_block = 30607249
    for op in chain.stream(start_block=last_block):
        if last_block % 10 == 0:
            sys.stdout.flush()

        processOp(op)
        last_block = op['block_num']
        steem_space.update('last_block_id', [('=', 1, last_block)])


def main():
    global steem
    global tnt_server
    global steem_space
    global chain

    print('starting datafeed.py..')
    print('Connecting to ', NODE_URL)
    sys.stdout.flush()

    steem = Steem(NODE_URL)
    chain = Blockchain(steemd_instance=steem, mode='head')

    while True:
        try:
            print(f'Connecting to tarantool ({TARANTOOL_HOST}:3301)..')
            sys.stdout.flush()
            tnt_server = tarantool.connect(TARANTOOL_HOST, 3301)
            steem_space = tnt_server.space('steem')
        except Exception as e:
            print('Cannot connect to tarantool server', file=sys.stderr)
            print(str(e), file=sys.stderr)
            sys.stderr.flush()
            time.sleep(10)
            continue
        else:
            while True:
                print('Started')
                sys.stdout.flush()
                run()
                print('[run] exited, continue..')


if __name__ == "__main__":
    main()
