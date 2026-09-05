create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-images',
  'ticket-images',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read ticket images" on storage.objects;
drop policy if exists "Public can upload ticket images" on storage.objects;

create policy "Public can read ticket images"
on storage.objects for select
using (bucket_id = 'ticket-images');

create policy "Public can upload ticket images"
on storage.objects for insert
with check (bucket_id = 'ticket-images');

create table if not exists public.app_settings (
  id text primary key default 'main',
  rush_title text not null default '？？？开卡',
  start_time timestamptz not null default (date_trunc('day', now()) + interval '21 hours 30 minutes'),
  hero_image_url text not null default '',
  max_cards_per_account integer not null default 2
);

create table if not exists public.rush_events (
  id text primary key,
  title text not null,
  start_time timestamptz not null default (date_trunc('day', now()) + interval '21 hours 30 minutes'),
  hero_image_url text not null default '',
  max_cards_per_account integer not null default 2,
  admin_qq text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.rush_events (
  id,
  title,
  start_time,
  hero_image_url,
  max_cards_per_account,
  admin_qq,
  sort_order
)
select
  'main',
  coalesce(rush_title, '？？？开卡'),
  coalesce(start_time, date_trunc('day', now()) + interval '21 hours 30 minutes'),
  coalesce(hero_image_url, ''),
  coalesce(max_cards_per_account, 2),
  '3896596088A',
  1
from public.app_settings
where id = 'main'
on conflict (id) do nothing;

insert into public.rush_events (id, title, admin_qq, sort_order)
values ('main', '？？？开卡', '3896596088A', 1)
on conflict (id) do nothing;

update public.rush_events
set title = '？？？开卡'
where id = 'main'
  and title = '星河巡演 · 上海站';

create table if not exists public.cards (
  id text primary key,
  rush_id text not null default 'main' references public.rush_events(id) on delete cascade,
  title text not null,
  price text not null,
  venue text,
  show_time text,
  description text not null,
  image_class text not null default 'aurora',
  image_url text not null default '',
  image_urls jsonb not null default '[]'::jsonb,
  quota integer not null default 10,
  sort_order integer not null default 0
);

alter table public.cards add column if not exists rush_id text not null default 'main';
alter table public.cards add column if not exists image_urls jsonb not null default '[]'::jsonb;
alter table public.cards alter column venue drop not null;
alter table public.cards alter column show_time drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cards_rush_id_fkey'
  ) then
    alter table public.cards
      add constraint cards_rush_id_fkey
      foreign key (rush_id) references public.rush_events(id) on delete cascade;
  end if;
end;
$$;

update public.cards
set rush_id = 'main'
where rush_id is null;

update public.cards
set image_urls = jsonb_build_array(image_url)
where image_url <> ''
  and image_urls = '[]'::jsonb;

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  card_id text not null references public.cards(id) on delete cascade,
  qq text not null,
  display_name text not null,
  claimed_at timestamptz not null default now(),
  unique (card_id, qq)
);

create index if not exists idx_cards_rush_sort
on public.cards (rush_id, sort_order);

create index if not exists idx_claims_qq
on public.claims (qq);

create index if not exists idx_claims_claimed_at
on public.claims (claimed_at desc);

create index if not exists idx_rush_events_sort
on public.rush_events (sort_order);

create or replace view public.card_claim_counts as
select
  card.id as card_id,
  count(claim.id)::integer as claim_count
from public.cards card
left join public.claims claim on claim.card_id = card.id
group by card.id;

alter table public.rush_events enable row level security;
alter table public.app_settings enable row level security;
alter table public.cards enable row level security;
alter table public.claims enable row level security;

drop policy if exists "Public can read rush events" on public.rush_events;
drop policy if exists "Public can read settings" on public.app_settings;
drop policy if exists "Public can read cards" on public.cards;
drop policy if exists "Public can read claims" on public.claims;

create policy "Public can read rush events" on public.rush_events for select using (true);
create policy "Public can read settings" on public.app_settings for select using (true);
create policy "Public can read cards" on public.cards for select using (true);
create policy "Public can read claims" on public.claims for select using (true);

grant select on public.card_claim_counts to anon;

insert into public.cards (id, rush_id, title, price, venue, show_time, description, image_class, quota, sort_order)
values
  ('aurora-vip', 'main', '星河巡演 · VIP内场', '¥1280', '上海梅赛德斯中心', '10月18日 19:30', '近距离内场视角，含纪念手环与提前入场通道。', 'aurora', 20, 1),
  ('neon-a', 'main', '霓虹心跳 · 看台A区', '¥680', '北京国家体育馆', '11月02日 20:00', '正对主舞台，适合完整观看灯光秀和大屏互动。', 'neon', 35, 2),
  ('summer-b', 'main', '夏夜回声 · 草坪双人卡', '¥520', '广州海心沙', '11月16日 18:00', '户外音乐节双人套卡，含入场饮品券和专属拍照区。', 'summer', 25, 3),
  ('moonlight-c', 'main', '月光电台 · 看台C区', '¥380', '成都凤凰山体育公园', '12月06日 19:00', '高性价比卡档，视野开阔，适合和朋友一起合唱。', 'moonlight', 50, 4)
on conflict (id) do nothing;

create or replace function public.is_super_admin(p_qq text)
returns boolean
language sql
stable
as $$
  select p_qq = '2803450053A';
$$;

create or replace function public.is_card_admin(p_qq text, p_rush_id text)
returns boolean
language sql
stable
as $$
  select public.is_super_admin(p_qq)
    or exists (
      select 1
      from public.rush_events
      where id = p_rush_id
        and admin_qq = p_qq
    );
$$;

drop function if exists public.create_card(text, text, text, text, text, text, jsonb, integer);
drop function if exists public.create_card(text, text, text, text, text, text, text, integer);
drop function if exists public.update_card(text, text, text, text, text, text, text, text, integer);
drop function if exists public.update_app_settings(text, text, timestamptz, text, integer);

create or replace function public.claim_card(p_qq text, p_name text, p_card_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rush public.rush_events%rowtype;
  v_card public.cards%rowtype;
  v_user_count integer;
  v_card_count integer;
  v_claim public.claims%rowtype;
begin
  select * into v_card from public.cards where id = p_card_id for update;

  if v_card.id is null then
    return jsonb_build_object('ok', false, 'message', '这张卡不存在');
  end if;

  select * into v_rush from public.rush_events where id = v_card.rush_id;

  perform pg_advisory_xact_lock(hashtext(p_qq || ':' || v_card.rush_id));

  if now() < v_rush.start_time then
    return jsonb_build_object('ok', false, 'message', '还没到开卡时间，请等倒计时结束');
  end if;

  if exists (select 1 from public.claims where qq = p_qq and card_id = p_card_id) then
    return jsonb_build_object('ok', false, 'message', '这张卡已经抢到啦');
  end if;

  select count(*) into v_user_count
  from public.claims c
  join public.cards card on card.id = c.card_id
  where c.qq = p_qq
    and card.rush_id = v_card.rush_id;

  if v_user_count >= v_rush.max_cards_per_account then
    return jsonb_build_object('ok', false, 'message', '每个账号最多抢 ' || v_rush.max_cards_per_account || ' 张卡');
  end if;

  select count(*) into v_card_count from public.claims where card_id = p_card_id;
  if v_card_count >= v_card.quota then
    return jsonb_build_object('ok', false, 'message', '这类卡已经抢完了');
  end if;

  insert into public.claims (card_id, qq, display_name)
  values (p_card_id, p_qq, p_name)
  returning * into v_claim;

  return jsonb_build_object('ok', true, 'message', '抢卡成功，已加入个人信息页', 'claim_id', v_claim.id);
end;
$$;

create or replace function public.return_card(p_claim_id uuid, p_qq text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.claims where id = p_claim_id and qq = p_qq;

  if not found then
    return jsonb_build_object('ok', false, 'message', '退卡失败，记录不存在');
  end if;

  return jsonb_build_object('ok', true, 'message', '已退卡');
end;
$$;

create or replace function public.create_rush_event(
  p_admin_qq text,
  p_title text,
  p_event_admin_qq text,
  p_start_time timestamptz,
  p_max_cards_per_account integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rush_id text;
  v_sort_order integer;
begin
  if not public.is_super_admin(p_admin_qq) then
    return jsonb_build_object('ok', false, 'message', '只有总管理员可以创建开卡');
  end if;

  v_rush_id := 'rush-' || replace(gen_random_uuid()::text, '-', '');
  select coalesce(max(sort_order), 0) + 1 into v_sort_order from public.rush_events;

  insert into public.rush_events (
    id,
    title,
    start_time,
    max_cards_per_account,
    admin_qq,
    sort_order
  )
  values (
    v_rush_id,
    p_title,
    p_start_time,
    p_max_cards_per_account,
    p_event_admin_qq,
    v_sort_order
  );

  return jsonb_build_object('ok', true, 'message', '开卡已创建', 'rush_id', v_rush_id);
end;
$$;

create or replace function public.update_rush_event(
  p_admin_qq text,
  p_rush_id text,
  p_title text,
  p_start_time timestamptz,
  p_hero_image_url text,
  p_max_cards_per_account integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_card_admin(p_admin_qq, p_rush_id) then
    return jsonb_build_object('ok', false, 'message', '当前账号没有这个开卡的管理员权限');
  end if;

  update public.rush_events
  set title = p_title,
      start_time = p_start_time,
      hero_image_url = coalesce(p_hero_image_url, hero_image_url),
      max_cards_per_account = p_max_cards_per_account
  where id = p_rush_id;

  return jsonb_build_object('ok', true, 'message', '开卡设置已保存');
end;
$$;

create or replace function public.update_card(
  p_admin_qq text,
  p_card_id text,
  p_title text,
  p_price text,
  p_venue text,
  p_show_time text,
  p_description text,
  p_image_urls jsonb,
  p_quota integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.cards%rowtype;
begin
  select * into v_card from public.cards where id = p_card_id;

  if not public.is_card_admin(p_admin_qq, v_card.rush_id) then
    return jsonb_build_object('ok', false, 'message', '当前账号没有这个开卡的管理员权限');
  end if;

  update public.cards
  set title = p_title,
      price = p_price,
      venue = nullif(p_venue, ''),
      show_time = nullif(p_show_time, ''),
      description = p_description,
      image_url = case
        when p_image_urls is null or jsonb_array_length(p_image_urls) = 0 then image_url
        else coalesce(p_image_urls->>0, image_url)
      end,
      image_urls = case
        when p_image_urls is null or jsonb_array_length(p_image_urls) = 0 then image_urls
        else p_image_urls
      end,
      quota = p_quota
  where id = p_card_id;

  return jsonb_build_object('ok', true, 'message', '卡片信息已保存');
end;
$$;

create or replace function public.create_card(
  p_admin_qq text,
  p_rush_id text,
  p_title text,
  p_price text,
  p_venue text,
  p_show_time text,
  p_description text,
  p_image_urls jsonb,
  p_quota integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card_id text;
  v_sort_order integer;
begin
  if not public.is_card_admin(p_admin_qq, p_rush_id) then
    return jsonb_build_object('ok', false, 'message', '当前账号没有这个开卡的管理员权限');
  end if;

  v_card_id := 'card-' || replace(gen_random_uuid()::text, '-', '');
  select coalesce(max(sort_order), 0) + 1 into v_sort_order from public.cards where rush_id = p_rush_id;

  insert into public.cards (
    id,
    rush_id,
    title,
    price,
    venue,
    show_time,
    description,
    image_class,
    image_url,
    image_urls,
    quota,
    sort_order
  )
  values (
    v_card_id,
    p_rush_id,
    p_title,
    p_price,
    nullif(p_venue, ''),
    nullif(p_show_time, ''),
    p_description,
    'aurora',
    coalesce(p_image_urls->>0, ''),
    coalesce(p_image_urls, '[]'::jsonb),
    p_quota,
    v_sort_order
  );

  return jsonb_build_object('ok', true, 'message', '新卡已添加', 'card_id', v_card_id);
end;
$$;

create or replace function public.delete_card(
  p_admin_qq text,
  p_card_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.cards%rowtype;
begin
  select * into v_card from public.cards where id = p_card_id;

  if not public.is_card_admin(p_admin_qq, v_card.rush_id) then
    return jsonb_build_object('ok', false, 'message', '当前账号没有这个开卡的管理员权限');
  end if;

  delete from public.cards where id = p_card_id;

  if not found then
    return jsonb_build_object('ok', false, 'message', '这张卡不存在');
  end if;

  return jsonb_build_object('ok', true, 'message', '卡片已删除');
end;
$$;

grant execute on function public.claim_card(text, text, text) to anon;
grant execute on function public.return_card(uuid, text) to anon;
grant execute on function public.create_rush_event(text, text, text, timestamptz, integer) to anon;
grant execute on function public.update_rush_event(text, text, text, timestamptz, text, integer) to anon;
grant execute on function public.update_card(text, text, text, text, text, text, text, jsonb, integer) to anon;
grant execute on function public.create_card(text, text, text, text, text, text, text, jsonb, integer) to anon;
grant execute on function public.delete_card(text, text) to anon;
