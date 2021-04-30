#!/usr/bin/env python
from contextlib import suppress

from golos.steem import Steem
from golos.account import Account
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

MIN_NOTIFY_REPUTATION = 0

NTYPES = {
    'total': 0,
    'feed': 1,
    'reward': 2,
    'send': 3,
    'mention': 4,
    'follow': 5,
    'vote': 6,
    'comment_reply': 7,
    'post_reply': 8,
    'account_update': 9,
    'message': 10,
    'receive': 11,
    'donate': 12
}

# gloabal variables
steem = None
tnt_server = None
steem_space = None
followers_space = None
chain = None
img_proxy_prefix = 'https://steemitimages.com/'
processed_posts = {}
processed_messages = {}

STEEMIT_WEBCLIENT_ADDRESS = os.environ.get('STEEMIT_WEBCLIENT_ADDRESS', 'https://golos.id')
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


def getFollowersWithDirection(account, direction='follower', last_user=''):
    if direction == 'follower':
        followers = account.get_followers()
    elif direction == 'following':
        followers = account.get_following()
    return followers


def getFollowers(account):
    print('getFollowers', account.name)
    res = followers_space.select(account.name)
    if len(res) == 0:
        followers = getFollowersWithDirection(account)
        followers_space.insert((account.name, followers))
    else:
        followers = res[0][1]
    return followers


def addFollower(account_name, follower):
    print('addFollower', account_name, follower)
    res = tnt_server.call('add_follower', account_name, follower)
    if not res[0]:
        with suppress(Exception):
            followers = getFollowersWithDirection(Account(account_name))
            followers.append(follower)
            followers_space.insert((account_name, followers))
            tnt_server.call('add_follower', account_name, follower)


def processMentions(author_account, text, op):
    mentions = re.findall('\@[\w\d.-]+', text)
    if (len(mentions) == 0):
        return
    if op['parent_author']:
        what = 'comment'
        url = '%s/@%s/%s#@%s/%s' % (
            STEEMIT_WEBCLIENT_ADDRESS,
            op['parent_author'],
            op['parent_permlink'],
            op['author'],
            op['permlink']
        )
    else:
        what = 'post'
        url = '%s/@%s/%s' % (STEEMIT_WEBCLIENT_ADDRESS, op['author'], op['permlink'])

    for mention in set(mentions):
        if (mention == op['author']):
            # don't notify on self-mentions
            continue
        print('--- mention: ', what, url, mention, mention[1:])
        title = 'Golos'
        body = '@%s mentioned you in a %s' % (op['author'], what)
        profile = author_account.profile
        pic = img_proxy_prefix + profile['profile_image'] \
            if profile and 'profile_image' in profile else ''
        tnt_server.call(
            'notification_add',
            mention[1:],
            NTYPES['mention'],
            None,
            None,
            title,
            body,
            url,
            pic
        )


def processFollow(op):
    op_json = json.loads(op['json'])
    if not isinstance(op_json, list) or op_json[0] != 'follow':
        return
    data = op_json[1]
    addFollower(data['following'], data['follower'])
    tnt_server.call(
        'notification_add',
        data['following'],
        NTYPES['follow']
    )


def processComment(op):
    comment_body = op['body']
    if not comment_body or comment_body.startswith('@@ '):
        return
    try:
        post = Post(op, steemd_instance=steem)
    except PostDoesNotExist as err:
        print('Err update post', err)
        return

    pkey = getPostKey(post)
    print('post: ', pkey)
    if not pkey or pkey in processed_posts:
        return
    processed_posts[pkey] = True
    author_account = Account(op['author'], steemd_instance=steem)
    processMentions(author_account, comment_body, op)
    if op['parent_author']:
        if op['parent_author'] != op['author']:
            # no need to notify self of own comments
            title = 'Golos'
            body = '@%s replied to your post or comment' % (op['author'])
            url = '%s/@%s/recent-replies' % (
                STEEMIT_WEBCLIENT_ADDRESS,
                op['parent_author']
            )
            profile = author_account.profile
            pic = img_proxy_prefix + profile['profile_image'] \
                if profile and 'profile_image' in profile else ''
            tnt_server.call(
                'notification_add',
                op['parent_author'],
                NTYPES['comment_reply'],
                None,
                None,
                title,
                body,
                url,
                pic
            )
    else:
        followers = getFollowers(author_account)
        for follower in followers:
            tnt_server.call('notification_add', follower, NTYPES['feed'])


def processTransfer(op):
    if op['from'] == op['to']:
        return
    print("transfer", op['from'], op['to'])
    title = 'Golos'
    body = 'you transfered %s to @%s' % (op['amount'], op['to'])
    url = '%s/@%s/transfers' % (STEEMIT_WEBCLIENT_ADDRESS, op['from'])
    tnt_server.call(
        'notification_add',
        op['from'],
        NTYPES['send'],
        None,
        None,
        title,
        body,
        url,
        ''
    )
    body = 'you received %s from @%s' % (op['amount'], op['from'])
    url = '%s/@%s/transfers' % (STEEMIT_WEBCLIENT_ADDRESS, op['to'])
    tnt_server.call(
        'notification_add',
        op['to'],
        NTYPES['receive'],
        None,
        None,
        title,
        body,
        url,
        ''
    )

def processDonate(op):
    if op['from'] == op['to']:
        return
    print("donate", op['from'], op['to'])
    title = 'Golos'
    body = 'you received %s donate from @%s' % (op['amount'], op['from'])
    url = '%s/@%s/donates-to' % (STEEMIT_WEBCLIENT_ADDRESS, op['to'])
    tnt_server.call(
        'notification_add',
        op['to'],
        NTYPES['donate'],
        None,
        None,
        title,
        body,
        url,
        ''
    )


def processMessage(op):
    print('message')
    sys.stdout.flush()
    op_json = json.loads(op['json'])
    if not isinstance(op_json, list) or op_json[0] not in ['private_message', 'private_delete_message']:
        return
    data = op_json[1]
    # pkey = data['from'] + '/' + data['to'] + '/' + data['nonce']
    # print('message: ', pkey)
    # if pkey in processed_messages:
    #     return
    # processed_messages[pkey] = True
    tnt_server.call(
        'notification_add',
        data['from'],
        None,
        op_json,
        op['timestamp']
    )
    tnt_server.call(
        'notification_add',
        data['to'],
        NTYPES['message'],
        op_json,
        op['timestamp']
    )


#def processAccountUpdate(op):
#    print(json.dumps(op, indent=4))
#    if not ('active' in op or 'owner' in op or 'posting' in op):
#        return
#
#    title = 'Golos'
#    body = 'account @%s has been updated or had its password changed' % (
#        op['account']
#    )
#    url = '%s/@%s/permissions' % (STEEMIT_WEBCLIENT_ADDRESS, op['account'])
#    tnt_server.call(
#        'notification_add',
#        op['account'],
#        NTYPES['account_update'],
#        None,
#        None,
#        title,
#        body,
#        url,
#        ''
#    )


def processOp(op_data):
    op_type = op_data['type']
    op = op_data

    if op_type == 'custom_json' and op['id'] == 'follow':
        processFollow(op)

    if op_type == 'custom_json' and op['id'] == 'private_message':
        processMessage(op)

    if op_type == 'comment':
        processComment(op)

    if op_type.startswith('transfer') or op_type == 'claim':
        processTransfer(op)

    if op_type == 'donate':
        processDonate(op)

#    if op_type == 'account_update':
#        processAccountUpdate(op)


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
    global followers_space
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
            followers_space = tnt_server.space('followers')
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
