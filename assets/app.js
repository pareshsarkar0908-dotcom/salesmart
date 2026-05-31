async function grantAutomaticTrial(){
  const email = normalizeEmail(getEmail());
  if(!email) return false;

  const trialCredits = PLANS.trial.credits;
  const locallyMarked = trialEmails().includes(email);
  let alreadyRecorded = locallyMarked;

  if(supabaseClient){
    const existing = await supabaseClient
      .from('orders')
      .select('id')
      .eq('email', email)
      .eq('status', 'trial')
      .limit(1);

    if(!existing.error && existing.data?.length){
      alreadyRecorded = true;
    }
  }

  if(alreadyRecorded){
    markTrial(email);

    if(getCredits() < trialCredits){
      setCredits(trialCredits);
      await saveCredits();
      return true;
    }

    return false;
  }

  markTrial(email);
  addCredits(trialCredits);
  await saveCredits();

  if(supabaseClient){
    const inserted = await supabaseClient
      .from('orders')
      .insert({
        email,
        plan: 'trial',
        amount: 0,
        credits: trialCredits,
        status: 'trial'
      });

    if(inserted.error){
      console.error('Automatic trial record error:', inserted.error);
    }
  }

  return true;
}
