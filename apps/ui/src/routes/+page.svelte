<script lang="ts">

  import { getFeed } from '$lib/api';

  getFeed().then(data => console.log(data));
</script>

<h1>Notemap</h1>