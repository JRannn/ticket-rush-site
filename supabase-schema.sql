create extension if not exists pgcrypto;

create table if not exists public.app_settings (
  id text primary key default 'main',
  rush_title text not null default '星河巡演 · 上海站',
  start_time timestamptz not null default (date_trunc('day', now()) + interval '21 hours 30 minutes'),
  hero_image_url text not null default '',
  max_cards_per_account integer not null default 2
);

create table if not exists public.cards (
  id text primary key,
  title text not null,
  price text not null,
  venue text not null,
  show_time text not null,
  description text not null,
  image_class text not null default 'aurora',
  image_url text not null default '',
  quota integer not null default 10,
  sort_order integer not null default 0
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  card_id text not null references public.cards(id) on delete cascade,
  qq text not null,
  display_name text not null,
  claimed_at timestamptz not null default now(),
  unique (card_id, qq)
);

alter table public.app_settings enable row level security;
alter table public.cards enable row level security;
alter table public.claims enable row level security;

drop policy if exists "Public can read settings" on public.app_settings;
drop policy if exists "Public can read cards" on public.cards;
drop policy if exists "Public can read claims" on public.claims;

create policy "Public can read settings" on public.app_settings for select using (true);
create policy "Public can read cards" on public.cards for select using (true);
create policy "Public can read claims" on public.claims for select using (true);

insert into public.app_settings (id, rush_title, max_cards_per_account)
values ('main', '星河巡演 · 上海站', 2)
on conflict (id) do nothing;

insert into public.cards (id, title, price, venue, show_time, description, image_class, quota, sort_order)
values
  ('aurora-vip', '星河巡演 · VIP内场', '¥1280', '上海梅赛德斯中心', '10月18日 19:30', '近距离内场视角，含纪念手环与提前入场通道。', 'aurora', 20, 1),
  ('neon-a', '霓虹心跳 · 看台A区', '¥680', '北京国家体育馆', '11月02日 20:00', '正对主舞台，适合完整观看灯光秀和大屏互动。', 'neon', 35, 2),
  ('summer-b', '夏夜回声 · 草坪双人卡', '¥520', '广州海心沙', '11月16日 18:00', '户外音乐节双人套卡，含入场饮品券和专属拍照区。', 'summer', 25, 3),
  ('moonlight-c', '月光电台 · 看台C区', '¥380', '成都凤凰山体育公园', '12月06日 19:00', '高性价比卡档，视野开阔，适合和朋友一起合唱。', 'moonlight', 50, 4)
on conflict (id) do nothing;

create or replace function public.is_card_admin(p_qq text)
returns boolean
language sql
stable
as $$
  select p_qq in ('2803450053A', '3896596088A');
$$;

create or replace function public.claim_card(p_qq text, p_name text, p_card_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.app_settings%rowtype;
  v_card public.cards%rowtype;
  v_user_count integer;
  v_card_count integer;
  v_claim public.claims%rowtype;
begin
  select * into v_settings from public.app_settings where id = 'main';
  select * into v_card from public.cards where id = p_card_id for update;

  if v_card.id is null then
    return jsonb_build_object('ok', false, 'message', '这张卡不存在');
  end if;

  if now() < v_settings.start_time then
    return jsonb_build_object('ok', false, 'message', '还没到开抢时间，请等倒计时结束');
  end if;

  if exists (select 1 from public.claims where qq = p_qq and card_id = p_card_id) then
    return jsonb_build_object('ok', false, 'message', '这张卡已经抢到啦');
  end if;

  select count(*) into v_user_count from public.claims where qq = p_qq;
  if v_user_count >= v_settings.max_cards_per_account then
    return jsonb_build_object('ok', false, 'message', '每个账号最多抢 ' || v_settings.max_cards_per_account || ' 张卡');
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

create or replace function public.update_app_settings(
  p_admin_qq text,
  p_rush_title text,
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
  if not public.is_card_admin(p_admin_qq) then
    return jsonb_build_object('ok', false, 'message', '当前账号没有管理员权限');
  end if;

  update public.app_settings
  set rush_title = p_rush_title,
      start_time = p_start_time,
      hero_image_url = coalesce(p_hero_image_url, hero_image_url),
      max_cards_per_account = p_max_cards_per_account
  where id = 'main';

  return jsonb_build_object('ok', true, 'message', '开抢设置已保存');
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
  p_image_url text,
  p_quota integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_card_admin(p_admin_qq) then
    return jsonb_build_object('ok', false, 'message', '当前账号没有管理员权限');
  end if;

  update public.cards
  set title = p_title,
      price = p_price,
      venue = p_venue,
      show_time = p_show_time,
      description = p_description,
      image_url = coalesce(p_image_url, image_url),
      quota = p_quota
  where id = p_card_id;

  return jsonb_build_object('ok', true, 'message', '卡片信息已保存');
end;
$$;

grant execute on function public.claim_card(text, text, text) to anon;
grant execute on function public.return_card(uuid, text) to anon;
grant execute on function public.update_app_settings(text, text, timestamptz, text, integer) to anon;
grant execute on function public.update_card(text, text, text, text, text, text, text, text, integer) to anon;
