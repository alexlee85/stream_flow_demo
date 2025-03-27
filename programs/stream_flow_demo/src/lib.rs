#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked},
};

declare_id!("HDnWpNXm6nqJ3m3cZeQdaTWvMkCAXSkHLFN95CxaWz1S");

#[program]
pub mod stream_flow_demo {

    use super::*;

    pub fn deposit(ctx: Context<Deposit>, args: DepositIxArgs) -> Result<()> {
        msg!("deposit action: {:?}", ctx.program_id);
        // let transfer_ctx = ctx.accounts.to_transfer_ctx();
        // token_interface::transfer_checked(
        //     transfer_ctx,
        //     args.net_amount_deposited + 50_000_000_000,
        //     9,
        // )?;

        let x = ctx.accounts.sender.key();
        let seeds = &[
            b"user_account",
            x.as_ref(),
            &[ctx.bumps.sender_deposit_account],
        ];
        let d = &[seeds.as_ref()];
        let sf_ctx = ctx.accounts.to_sf_create_ctx().with_signer(d);
        streamflow_sdk::cpi::create(
            sf_ctx,
            args.start_time,
            args.net_amount_deposited,
            args.period,
            args.amount_per_period,
            args.cliff,
            args.cliff_amount,
            args.cancelable_by_sender,
            args.cancelable_by_recipient,
            args.automatic_withdrawal,
            args.transferable_by_sender,
            args.transferable_by_recipient,
            args.can_topup,
            args.stream_name,
            args.withdraw_frequency,
            args.pausable,
            args.can_update_rate,
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    /// Associated token account address of `sender`.
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = sender,
        associated_token::token_program = token_program,
    )]
    pub sender_tokens: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = sender,
        space = 8 + UserDepositAccount::INIT_SPACE,
        seeds=[b"user_account", sender.key().as_ref()],
        bump,
    )]
    pub sender_deposit_account: Box<Account<'info, UserDepositAccount>>,
    #[account(
        init_if_needed,
        payer = sender,
        associated_token::mint = mint,
        associated_token::authority = sender_deposit_account,
        associated_token::token_program = token_program,
    )]
    pub sender_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub metadata: Signer<'info>,
    /// The escrow account holding the funds.
    /// Should be a PDA, use `streamflow_sdk::state::find_escrow_account` to derive
    /// Expects empty (non-initialized) account.
    #[account(
        mut,
        seeds = [b"strm", metadata.key().to_bytes().as_ref()],
        bump,
        seeds::program = streamflow_program
    )]
    /// CHECK: The escrow account holding the funds, expects empty (non-initialized) account.
    pub escrow_tokens: UncheckedAccount<'info>,
    /// Streamflow treasury account.
    /// Use constant `streamflow_sdk::state::STRM_TREASURY`
    #[account(mut)]
    /// CHECK: Streamflow treasury account.
    pub streamflow_treasury: UncheckedAccount<'info>,
    /// Associated token account address of `streamflow_treasury`.
    #[account(
        init_if_needed,
        payer = sender,
        associated_token::mint = mint,
        associated_token::authority = streamflow_treasury,
    )]
    pub streamflow_treasury_tokens: InterfaceAccount<'info, TokenAccount>,
    /// Delegate account for automatically withdrawing contracts.
    /// Use constant `streamflow_sdk::state::WITHDRAWOR_ADDRESS`
    #[account(mut)]
    /// CHECK: Delegate account for automatically withdrawing contracts.
    pub withdrawor: UncheckedAccount<'info>,
    /// Partner treasury account. If no partner fees are expected on behalf of the program
    /// integrating with streamflow, `streamflow_treasury` can be passed in here.
    #[account(mut)]
    /// CHECK: Partner treasury account.
    pub partner: UncheckedAccount<'info>,
    /// Associated token account address of `partner`. If no partner fees are expected on behalf of the
    /// program integrating with streamflow, `streamflow_treasury_tokens` can be passed in here.
    #[account(
        init_if_needed,
        payer = sender,
        associated_token::mint = mint,
        associated_token::authority = partner,
    )]
    pub partner_tokens: InterfaceAccount<'info, TokenAccount>,
    /// The SPL token mint account.
    pub mint: InterfaceAccount<'info, Mint>,
    /// Internal program that handles fees for specified partners. If no partner fees are expected
    /// on behalf of the program integrating with streamflow, `streamflow_treasury` can be passed
    /// in here.
    /// Use constant `streamflow_sdk::state::FEE_ORACLE_ADDRESS`
    /// CHECK: Internal program that handles fees for specified partners.
    pub fee_oracle: UncheckedAccount<'info>,
    /// The Rent Sysvar account.
    pub rent: Sysvar<'info, Rent>,
    /// Streamflow protocol (alias timelock) program account.
    /// Use `streamflow_sdk:id()`
    /// CHECK: Streamflow protocol (alias timelock) program account.
    pub streamflow_program: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Deposit<'info> {
    pub fn to_transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, TransferChecked<'info>> {
        let cpi_accounts = TransferChecked {
            mint: self.mint.to_account_info(),
            authority: self.sender.to_account_info(),
            from: self.sender_tokens.to_account_info(),
            to: self.sender_vault.to_account_info(),
        };

        CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
    }

    pub fn to_sf_create_ctx(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, streamflow_sdk::cpi::accounts::Create<'info>> {
        let accounts = streamflow_sdk::cpi::accounts::Create {
            sender: self.sender.to_account_info(),
            sender_tokens: self.sender_tokens.to_account_info(),
            recipient: self.sender_deposit_account.to_account_info(),
            recipient_tokens: self.sender_vault.to_account_info(),
            metadata: self.metadata.to_account_info(),
            escrow_tokens: self.escrow_tokens.to_account_info(),
            streamflow_treasury: self.streamflow_treasury.to_account_info(),
            streamflow_treasury_tokens: self.streamflow_treasury_tokens.to_account_info(),
            withdrawor: self.withdrawor.to_account_info(),
            partner: self.partner.to_account_info(),
            partner_tokens: self.partner_tokens.to_account_info(),
            mint: self.mint.to_account_info(),
            fee_oracle: self.fee_oracle.to_account_info(),
            rent: self.rent.to_account_info(),
            timelock_program: self.streamflow_program.to_account_info(),
            token_program: self.token_program.to_account_info(),
            associated_token_program: self.associated_token_program.to_account_info(),
            system_program: self.system_program.to_account_info(),
        };
        CpiContext::new(self.streamflow_program.to_account_info(), accounts)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct DepositIxArgs {
    pub start_time: u64,
    pub net_amount_deposited: u64,
    pub period: u64,
    pub amount_per_period: u64,
    pub cliff: u64,
    pub cliff_amount: u64,
    pub cancelable_by_sender: bool,
    pub cancelable_by_recipient: bool,
    pub automatic_withdrawal: bool,
    pub transferable_by_sender: bool,
    pub transferable_by_recipient: bool,
    pub can_topup: bool,
    pub stream_name: [u8; 64],
    pub withdraw_frequency: u64,
    pub pausable: Option<bool>,
    pub can_update_rate: Option<bool>,
}

#[account]
#[derive(InitSpace)]
pub struct UserDepositAccount {}
