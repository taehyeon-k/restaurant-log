-- 「만원의 행복(thrift)」 라벨을 라벨첩에서 뺐습니다. 대표 라벨로 걸어 둔 사람은 비웁니다.
update public.profiles set title_label_id = null where title_label_id = 'thrift';
