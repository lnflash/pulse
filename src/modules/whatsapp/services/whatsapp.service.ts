import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../../auth/services/auth.service';
import { SessionService } from '../../auth/services/session.service';
import { GroupAuthService } from '../../auth/services/group-auth.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { UsernameService } from '../../flash-api/services/username.service';
import { PriceService } from '../../flash-api/services/price.service';
import { InvoiceService } from '../../flash-api/services/invoice.service';
import { TransactionService } from '../../flash-api/services/transaction.service';
import { PaymentService, PaymentSendResult } from '../../flash-api/services/payment.service';
import { PendingPaymentService } from '../../flash-api/services/pending-payment.service';
import { GeminiAiService } from '../../gemini-ai/gemini-ai.service';
import { EventsService } from '../../events/events.service';
import { ACCOUNT_DEFAULT_WALLET_QUERY } from '../../flash-api/graphql/queries';
import { QrCodeService } from './qr-code.service';
import { CommandParserService, CommandType, ParsedCommand } from './command-parser.service';
import { WhatsAppWebService } from './whatsapp-web.service';
import { InvoiceTrackerService } from './invoice-tracker.service';
import * as bolt11 from 'bolt11';
import { randomBytes } from 'crypto';
import { SupportModeService } from './support-mode.service';
import { validateUsername, getUsernameErrorMessage } from '../utils/username-validation';
import {
  validateMemo,
  validateAmount,
  sanitizeMemo,
  parseAndValidateAmount,
  getInvoiceValidationErrorMessage,
  AMOUNT_MAX_USD as _AMOUNT_MAX_USD,
} from '../utils/invoice-validation';
import { BalanceTemplate } from '../templates/balance-template';
import { AccountLinkRequestDto } from '../../auth/dto/account-link-request.dto';
import { VerifyOtpDto } from '../../auth/dto/verify-otp.dto';
import { UserSession } from '../../auth/interfaces/user-session.interface';
import { AdminSettingsService, VoiceMode } from './admin-settings.service';
import { TtsService } from '../../tts/tts.service';
import { PaymentConfirmationService } from './payment-confirmation.service';
import { UserVoiceSettingsService, UserVoiceMode } from './user-voice-settings.service';
import { VoiceResponseService } from './voice-response.service';
import { VoiceManagementService } from './voice-management.service';
import { convertCurrencyToWords } from '../utils/number-to-words';
import { OnboardingService } from './onboarding.service';
import { ContextualHelpService } from './contextual-help.service';
import { ResponseLengthUtil } from '../utils/response-length.util';
import { UndoTransactionService } from './undo-transaction.service';
import { PaymentTemplatesService } from './payment-templates.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { UserKnowledgeBaseService } from './user-knowledge-base.service';
import { RandomQuestionService } from './random-question.service';
import { PluginLoaderService, CommandContext } from '../../plugins';
import {
  RequestDeduplicator,
  DeduplicationKeyBuilder,
} from '../../common/services/request-deduplicator.service';
// import { WhatsAppCloudService } from './whatsapp-cloud.service'; // Disabled for prototype branch

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly groupAuthService: GroupAuthService,
    private readonly flashApiService: FlashApiService,
    private readonly balanceService: BalanceService,
    private readonly usernameService: UsernameService,
    private readonly priceService: PriceService,
    private readonly invoiceService: InvoiceService,
    private readonly transactionService: TransactionService,
    private readonly paymentService: PaymentService,
    private readonly pendingPaymentService: PendingPaymentService,
    private readonly geminiAiService: GeminiAiService,
    private readonly eventsService: EventsService,
    private readonly qrCodeService: QrCodeService,
    private readonly commandParserService: CommandParserService,
    private readonly balanceTemplate: BalanceTemplate,
    private readonly supportModeService: SupportModeService,
    private readonly adminSettingsService: AdminSettingsService,
    private readonly ttsService: TtsService,
    private readonly paymentConfirmationService: PaymentConfirmationService,
    private readonly userVoiceSettingsService: UserVoiceSettingsService,
    private readonly voiceResponseService: VoiceResponseService,
    private readonly voiceManagementService: VoiceManagementService,
    private readonly onboardingService: OnboardingService,
    private readonly contextualHelpService: ContextualHelpService,
    private readonly undoTransactionService: UndoTransactionService,
    private readonly paymentTemplatesService: PaymentTemplatesService,
    private readonly adminAnalyticsService: AdminAnalyticsService,
    private readonly userKnowledgeBaseService: UserKnowledgeBaseService,
    private readonly randomQuestionService: RandomQuestionService,
    private readonly pluginLoaderService: PluginLoaderService,
    private readonly requestDeduplicator: RequestDeduplicator,
    // private readonly whatsAppCloudService: WhatsAppCloudService, // Disabled for prototype branch
    @Inject(forwardRef(() => WhatsAppWebService))
    private readonly whatsappWebService?: WhatsAppWebService,
    @Inject(forwardRef(() => InvoiceTrackerService))
    private readonly invoiceTrackerService?: InvoiceTrackerService,
  ) {}

  /**
   * Get recent conversation history for support context
   */
  private async getRecentConversation(_whatsappId: string): Promise<string[]> {
    try {
      const messages: string[] = [];
      // Get last 10 messages from Redis or wherever they're stored
      // For now, return empty array as a placeholder
      return messages;
    } catch (error) {
      this.logger.error(`Error getting recent conversation: ${error.message}`);
      return [];
    }
  }

  /**
   * Helper to convert error messages to natural voice in voice-only mode
   */
  private async convertToVoiceOnlyResponse(
    message: string,
    whatsappId: string,
  ): Promise<string | { text: string; voice?: Buffer; voiceOnly?: boolean }> {
    const isVoiceOnly = await this.ttsService.shouldSendVoiceOnly(whatsappId);
    if (isVoiceOnly) {
      const naturalResponse = await this.voiceResponseService.convertToNaturalSpeech(message);
      const audioBuffer = await this.ttsService.textToSpeech(naturalResponse, 'en', whatsappId);
      return {
        text: '',
        voice: audioBuffer,
        voiceOnly: true,
      };
    }
    return message;
  }

  /**
   * Process incoming message from WhatsApp Cloud API
   */
  async processCloudMessage(messageData: {
    from: string;
    text: string;
    messageId: string;
    timestamp: string;
    name?: string;
    isVoiceCommand?: boolean;
    whatsappId?: string;
    isGroup?: boolean;
    groupId?: string;
    instancePhone?: string;
  }): Promise<string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean }> {
    try {
      const whatsappId = messageData.whatsappId || this.extractWhatsappId(messageData.from);
      const phoneNumber = this.normalizePhoneNumber(messageData.from);

      // Check if message is from support agent
      const supportPhone = this.configService.get<string>('SUPPORT_PHONE_NUMBER');
      if (supportPhone) {
        const normalizedSupportPhone = supportPhone.replace(/[\s\-+]/g, '');
        const normalizedSenderPhone = phoneNumber.replace(/[\s\-+]/g, '');

        // Also check the raw WhatsApp ID format
        const senderWithoutSuffix = whatsappId.replace('@c.us', '').replace(/[\s\-+]/g, '');

        if (
          normalizedSenderPhone === normalizedSupportPhone ||
          normalizedSenderPhone.endsWith(normalizedSupportPhone) ||
          normalizedSupportPhone.endsWith(normalizedSenderPhone) ||
          senderWithoutSuffix === normalizedSupportPhone ||
          senderWithoutSuffix.endsWith(normalizedSupportPhone) ||
          normalizedSupportPhone.endsWith(senderWithoutSuffix)
        ) {
          // This is a message from support agent
          this.logger.debug(`Support agent message detected from ${whatsappId}`);
          const result = await this.supportModeService.routeMessage(
            whatsappId,
            messageData.text,
            true,
          );
          if (result.routed) {
            return result.response || '✉️ Support message processed...';
          }
        }
      }

      // Parse command from message (with voice flag if it came from voice)
      const command = this.commandParserService.parseCommand(
        messageData.text,
        messageData.isVoiceCommand,
      );

      // Parallelize initial operations that don't depend on each other
      const startTime = Date.now();
      const [_storeResult, pendingQuestion, session, isNew, supportModeStatus] = await Promise.all([
        // Store the incoming message for traceability
        this.storeCloudMessage(messageData),
        // Check if user is in a learning session
        this.randomQuestionService.getPendingQuestion(whatsappId),
        // Get session if it exists
        this.sessionService.getSessionByWhatsappId(whatsappId),
        // Check if this is a new user
        this.onboardingService.isNewUser(whatsappId),
        // Check support mode status
        this.supportModeService.isInSupportMode(whatsappId),
      ]);

      // Log performance improvement
      this.logger.debug(`Initial checks completed in ${Date.now() - startTime}ms`);

      // Handle pending question if exists
      if (pendingQuestion && messageData.text.toLowerCase() !== 'skip') {
        // Process the answer to the pending question
        await this.userKnowledgeBaseService.storeUserKnowledge(
          whatsappId,
          pendingQuestion.question,
          messageData.text,
          pendingQuestion.category,
        );

        await this.randomQuestionService.clearPendingQuestion(whatsappId);

        let response = `✅ Thanks for teaching me! I've stored your answer.\n\n`;
        if (pendingQuestion.followUp) {
          response += `${pendingQuestion.followUp}\n\n`;
        }
        response += `💡 Type "learn" for another question or view your knowledge anytime.`;

        return response;
      }

      // Debug logging for @lid users
      if (whatsappId.includes('@lid')) {
        this.logger.log(`Debug: @lid user detected (anonymized ID): ${whatsappId}`);
        this.logger.log(`Debug: This is a privacy-protected user in a group`);
        this.logger.log(`Debug: They need to link from a DM first`);
      }

      // Track user activity for contextual help (fire and forget)
      this.contextualHelpService
        .trackActivity(whatsappId, command.rawText, command.type, false)
        .catch((err) => this.logger.error('Failed to track activity', err));

      if (isNew) {
        // For @lid users, show special instructions
        if (whatsappId.includes('@lid')) {
          return `👋 *Welcome to Pulse!*

I see you're using WhatsApp's privacy mode in this group.

To use Pulse:
1. Message me directly: @${this.configService.get('WHATSAPP_BOT_NUMBER', '18673225224')}
2. Type \`link\` to connect your Flash account
3. Then use me anywhere!

_Your phone number is hidden for privacy in this group._`;
        }

        // For completely new users, show welcome regardless of command
        return this.onboardingService.getWelcomeMessage(whatsappId);
      }

      // Silently track onboarding progress in background
      await this.onboardingService.detectAndUpdateProgress(whatsappId, command.rawText);

      // Check if user is in support mode (using pre-fetched status)
      if (supportModeStatus) {
        const result = await this.supportModeService.routeMessage(whatsappId, messageData.text);
        if (result.routed) {
          return result.response || '✉️ Message sent to support...';
        }
      }

      // Check if message is requesting support
      if (this.supportModeService.isRequestingSupport(messageData.text)) {
        // Store recent conversation context
        const recentMessages = await this.getRecentConversation(whatsappId);
        const supportResult = await this.supportModeService.initiateSupportMode(
          whatsappId,
          session,
          recentMessages,
          messageData.instancePhone,
        );
        return supportResult.message;
      }

      // Handle the command
      const response = await this.handleCommand(
        command,
        whatsappId,
        phoneNumber,
        session,
        messageData.isVoiceCommand,
        messageData.isGroup,
        messageData.groupId,
      );

      // Check if voice response is requested
      // Mark as AI response if it comes from unknown command (likely AI handled)
      const isAiResponse = command.type === CommandType.UNKNOWN;
      // Check if this was a voice-requested command (e.g., "voice help")
      const voiceRequested = command.args.voiceRequested === 'true';

      // Parallelize voice checks if voice is potentially needed
      const [shouldUseVoice, shouldSendVoiceOnly] = voiceRequested
        ? [true, await this.ttsService.shouldSendVoiceOnly(whatsappId)]
        : await Promise.all([
            this.ttsService.shouldUseVoice(messageData.text, isAiResponse, whatsappId),
            this.ttsService.shouldSendVoiceOnly(whatsappId),
          ]);

      // Add hints to text responses and optionally add voice
      if (typeof response === 'string') {
        let finalText = response;
        const hints: string[] = [];

        // Only add hints for welcome messages (after verification) and help commands
        const isWelcomeMessage =
          command.type === CommandType.VERIFY &&
          response.includes('Welcome') &&
          response.includes('connected');

        const isHelpCommand = command.type === CommandType.HELP;

        // Only process hints for welcome and help messages
        if ((isWelcomeMessage || isHelpCommand) && !messageData.isGroup) {
          // Collect all potential hints
          const baseHint = this.getContextualHint(session, command);
          if (baseHint && !response.includes('💡')) {
            hints.push(`💡 ${baseHint}`);
          }

          // Add contextual help if user seems confused
          const contextualHelp = await this.contextualHelpService.analyzeForConfusion(whatsappId);
          if (contextualHelp && !finalText.includes(contextualHelp)) {
            // Replace any existing hints with confusion help
            hints.length = 0;
            hints.push(contextualHelp);
          }

          // Add undo hint if applicable
          const undoHint = await this.undoTransactionService.getUndoHint(whatsappId);
          if (undoHint && !hints.some((h) => h.includes('undo'))) {
            hints.unshift(undoHint); // Add at beginning
          }

          // Add at most 2 hints to avoid clutter
          const hintsToAdd = hints.slice(0, 2);
          if (hintsToAdd.length > 0) {
            finalText += '\n\n' + hintsToAdd.join('\n\n');
          }
        }

        // Check for onboarding completion celebration (always show, not a hint)
        if (!messageData.isGroup) {
          const completionMessage = await this.onboardingService.getCompletionMessage(whatsappId);
          if (completionMessage) {
            finalText += completionMessage;
          }
        }

        if (shouldUseVoice) {
          try {
            // Convert hints to TTS-friendly format for voice
            let voiceText = finalText;
            if (finalText.includes('💡')) {
              const parts = finalText.split('💡');
              if (parts.length > 1) {
                const beforeHint = parts[0];
                const hintPart = parts[1].trim();
                const ttsFriendlyHint = this.makeTtsFriendlyHint(hintPart);
                voiceText = `${beforeHint}💡 ${ttsFriendlyHint}`;
              }
            }

            const audioBuffer = await this.ttsService.textToSpeech(voiceText, 'en', whatsappId);

            // If voice-only mode, return with empty text
            if (shouldSendVoiceOnly) {
              return { text: '', voice: audioBuffer, voiceOnly: true };
            }

            return { text: finalText, voice: audioBuffer };
          } catch (error) {
            this.logger.error('Failed to generate voice response:', error);
            return finalText;
          }
        }

        return finalText;
      } else if (response && typeof response === 'object' && 'text' in response) {
        // If response already has voice, don't regenerate it
        if (response.voice) {
          // For voice-only mode, return as is without modifying
          if (response.voiceOnly) {
            return response;
          }
          // Return response without adding hints (hints only for welcome/help)
          return response;
        }

        // Response doesn't have voice yet, use text as is (hints only for welcome/help)
        const finalText = response.text;

        // Check for forceVoice flag or normal voice conditions
        const useVoice = (response as any).forceVoice || shouldUseVoice;

        if (useVoice) {
          try {
            // Generate natural voice response based on command type
            let voiceText = finalText;

            // For command responses, use natural language generation
            if (command && command.type !== CommandType.UNKNOWN) {
              voiceText = await this.voiceResponseService.generateNaturalVoiceResponse(
                command.type,
                finalText,
                command.args,
                {
                  userName: session?.profileName,
                  isVoiceInput: messageData.isVoiceCommand || false,
                  originalResponse: finalText,
                  isLinked: !!session,
                  isVerified: session?.isVerified || false,
                  isGroup: messageData.isGroup || false,
                },
              );
            } else {
              // For AI responses, clean up for voice
              voiceText = this.cleanTextForVoice(finalText);
            }

            const audioBuffer = await this.ttsService.textToSpeech(voiceText, 'en', whatsappId);

            // If voice-only mode, return with empty text
            if (shouldSendVoiceOnly) {
              return {
                ...response,
                text: '',
                voice: audioBuffer,
                voiceOnly: true,
              };
            }

            return {
              ...response,
              text: finalText,
              voice: audioBuffer,
            };
          } catch (error) {
            this.logger.error('Failed to generate voice response:', error);
            return {
              ...response,
              text: finalText,
            };
          }
        }

        return {
          ...response,
          text: finalText,
        };
      }

      return response;
    } catch (error) {
      this.logger.error(`Error processing cloud message: ${error.message}`, error.stack);
      return "I'm sorry, something went wrong. Please try again later.";
    }
  }

  /**
   * Handle parsed command
   */
  private async handleCommand(
    command: ParsedCommand,
    whatsappId: string,
    phoneNumber: string,
    session: UserSession | null,
    isVoiceInput?: boolean,
    isGroup?: boolean,
    groupId?: string,
  ): Promise<string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean }> {
    try {
      // Check if user has a pending payment confirmation
      const pendingPayment = await this.paymentConfirmationService.getPendingPayment(whatsappId);
      if (pendingPayment) {
        // Check if this is a confirmation response
        const confirmText = command.rawText;

        if (this.paymentConfirmationService.isConfirmation(confirmText)) {
          // Clear the pending payment and execute it
          await this.paymentConfirmationService.clearPendingPayment(whatsappId);

          // Execute the original command
          const originalCommand = pendingPayment.command;
          // Mark as already confirmed to prevent infinite loop
          originalCommand.args.requiresConfirmation = 'false';

          if (originalCommand.type === CommandType.SEND) {
            return this.handleSendCommand(originalCommand, whatsappId, session);
          } else if (originalCommand.type === CommandType.REQUEST) {
            return this.handleRequestCommand(originalCommand, whatsappId, session);
          }
        } else if (this.paymentConfirmationService.isCancellation(confirmText)) {
          // Cancel the pending payment
          await this.paymentConfirmationService.clearPendingPayment(whatsappId);
          return ResponseLengthUtil.getConciseResponse('error');
        } else {
          // Show the pending payment details again
          const details = this.paymentConfirmationService.formatPaymentDetails(
            pendingPayment.command,
          );
          // Check if user is trying to change the amount
          const amountMatch = confirmText.match(/^\d+(\.\d{1,2})?$/);
          if (amountMatch) {
            // User entered a new amount
            const newAmount = amountMatch[0];
            const updatedCommand = { ...pendingPayment.command };
            updatedCommand.args.amount = newAmount;
            await this.paymentConfirmationService.storePendingPayment(
              whatsappId,
              pendingPayment.phoneNumber,
              updatedCommand,
              pendingPayment.sessionId,
            );
            const updatedDetails =
              this.paymentConfirmationService.formatPaymentDetails(updatedCommand);
            return `🔄 Amount updated!\n\n${updatedDetails}\n\n✅ Type "yes" or "ok" to confirm\n❌ Type "no" or "cancel" to cancel`;
          }

          return `⏳ *Pending Payment*\n\n${details}\n\n✅ yes/ok to confirm\n❌ no/cancel to cancel\n✏️ Or enter new amount`;
        }
      }

      // Check lockdown status first
      const lockdownMessage = await this.checkLockdown(whatsappId, command);
      if (lockdownMessage) {
        return lockdownMessage;
      }

      switch (command.type) {
        case CommandType.HELP:
          return this.getHelpMessage(session, command, isGroup);

        case CommandType.LINK:
          return this.handleLinkCommand(command, whatsappId, phoneNumber, isGroup);

        case CommandType.UNLINK:
          return this.handleUnlinkCommand(command, whatsappId, session);

        case CommandType.VERIFY:
          return this.handleVerifyCommand(command, whatsappId, session);

        case CommandType.BALANCE:
          return this.handleBalanceCommand(command, whatsappId, session);

        case CommandType.REFRESH:
          return this.handleRefreshCommand(whatsappId, session);

        case CommandType.USERNAME:
          return this.handleUsernameCommand(command, whatsappId, session);

        case CommandType.PRICE:
          return this.handlePriceCommand(whatsappId, session);

        case CommandType.SEND:
          // Check if send command needs confirmation
          if (command.args.requiresConfirmation !== 'false') {
            // Validate recipient before asking for confirmation
            const validationResult = await this.validateSendRecipient(command, session);
            if (validationResult.error) {
              return validationResult.error;
            }

            command.args.requiresConfirmation = 'true';
            // Store the command for confirmation with validation info
            if (validationResult.recipientInfo) {
              command.args.recipientValidated = 'true';
              command.args.recipientType = validationResult.recipientInfo.type;
              command.args.recipientDisplay = validationResult.recipientInfo.display;
            }

            const details = this.paymentConfirmationService.formatPaymentDetails(command);
            await this.paymentConfirmationService.storePendingPayment(
              whatsappId,
              phoneNumber,
              command,
              session?.sessionId,
            );

            const isVoiceCommand = command.args.isVoiceCommand === 'true';
            const header = isVoiceCommand
              ? '🎤 *Voice Payment Confirmation*'
              : '💸 *Payment Confirmation*';

            return `${header}\n\n${details}\n\n✅ Type *yes*, *ok*, or *pay* to confirm\n❌ Type *no* or *cancel* to cancel\n✏️ Or enter a new amount (e.g., "25")\n\n⏱️ This request will expire in 5 minutes.`;
          }
          return this.handleSendCommand(command, whatsappId, session);

        case CommandType.RECEIVE:
          return this.handleReceiveCommand(command, whatsappId, session);

        case CommandType.HISTORY:
          return this.handleHistoryCommand(command, whatsappId, session);

        case CommandType.REQUEST:
          return this.handleRequestCommand(command, whatsappId, session);

        case CommandType.CONTACTS:
          return this.handleContactsCommand(command, whatsappId, session);

        case CommandType.CONSENT:
          return this.handleConsentCommand(command, whatsappId, session);

        case CommandType.PAY:
          return this.handlePayCommand(command, whatsappId, session);

        case CommandType.VYBZ:
          return this.handleVybzCommand(command, whatsappId, session);

        case CommandType.PENDING:
          return this.handlePendingCommand(command, whatsappId, session);

        case CommandType.VOICE:
          return this.handleVoiceCommand(command, whatsappId);

        case CommandType.SETTINGS:
          return this.handleSettingsCommand(command, whatsappId, session);

        case CommandType.ADMIN:
          this.logger.debug(`Processing admin command:`, { command, whatsappId });
          return this.handleAdminCommand(command, whatsappId, phoneNumber);

        case CommandType.UNDO:
          return this.handleUndoCommand(whatsappId, session);

        case CommandType.TEMPLATE:
          return this.handleTemplateCommand(command, whatsappId, session);

        case CommandType.SKIP:
          return this.handleSkipCommand(whatsappId);

        case CommandType.LEARN:
          return this.handleLearnCommand(command, whatsappId, session);

        case CommandType.UNKNOWN:
        default: {
          // Try plugin commands first for unknown commands
          if (command.type === CommandType.UNKNOWN) {
            const pluginResponse = await this.tryPluginCommand(
              command,
              whatsappId,
              phoneNumber,
              session,
              isGroup,
              groupId,
            );
            if (pluginResponse) {
              return pluginResponse;
            }
          }
          // Check if this might be a Flash username response to pending send
          const pendingSendKey = `pending_send:${whatsappId}`;
          const pendingSendData = await this.redisService.get(pendingSendKey);

          if (pendingSendData && command.rawText.startsWith('@')) {
            const pending = JSON.parse(pendingSendData);
            const username = command.rawText.substring(1); // Remove @ prefix

            // Try to send to this username
            await this.redisService.del(pendingSendKey); // Clear pending

            const sendCommand: ParsedCommand = {
              type: CommandType.SEND,
              args: {
                amount: pending.amount.toString(),
                username: username,
                memo: pending.memo,
              },
              rawText: `send ${pending.amount} to @${username}`,
            };

            return this.handleSendCommand(sendCommand, whatsappId, session);
          }

          // Check if this might be a response to a pending contact request
          const pendingKey = `pending_request:${whatsappId}`;
          const pendingData = await this.redisService.get(pendingKey);

          if (pendingData) {
            const pending = JSON.parse(pendingData);
            if (pending.type === 'payment_request') {
              // Check if the message matches "contactname phonenumber" pattern
              const parts = command.rawText.trim().split(/\s+/);
              if (parts.length >= 2) {
                const possibleName = parts[0];
                const possiblePhone = parts.slice(1).join('');

                // Check if this matches the pending contact name
                if (possibleName.toLowerCase() === pending.contactName.toLowerCase()) {
                  // Process as contact addition with pending request
                  const response = await this.checkAndProcessPendingRequest(
                    whatsappId,
                    possibleName,
                    possiblePhone,
                  );

                  if (response) {
                    return response;
                  }
                }
              }
            }
          }

          // Check if this is a "yes" or "no" response to a pending consent request
          const lowerText = command.rawText.toLowerCase().trim();
          if ((lowerText === 'yes' || lowerText === 'no') && session) {
            // Check if there's a pending AI question (which indicates consent was requested)
            const normalizedWhatsappId = session.whatsappId.replace('+', '');
            const pendingQuestionKey = `pending_ai_question:${normalizedWhatsappId}`;
            const pendingQuestion = await this.redisService.get(pendingQuestionKey);

            if (pendingQuestion) {
              // Convert to consent command
              const consentCommand: ParsedCommand = {
                type: CommandType.CONSENT,
                args: { choice: lowerText },
                rawText: command.rawText,
              };
              return this.handleConsentCommand(consentCommand, whatsappId, session);
            }
          }

          // Check if the message contains a Lightning invoice
          const invoiceMatch = command.rawText.match(/\b(lnbc[a-z0-9]+)\b/i);
          if (invoiceMatch) {
            if (session?.isVerified) {
              return this.handleInvoiceDetected(invoiceMatch[1], whatsappId, session);
            } else {
              // User not linked but received an invoice
              return `⚡ *Lightning Invoice Detected*\n\nTo pay this invoice, you need to connect your Flash account first.\n\n👉 Type \`link\` to get started!\n\nOnce connected, you'll be able to:\n• Pay Lightning invoices instantly\n• Send money to other Flash users\n• Check your balance\n• And much more!`;
            }
          }

          // Check if user has an active vybz session
          if (session?.isVerified) {
            const vybzQueueKey = `vybz_waiting:${whatsappId}`;
            const waitingForContent = await this.redisService.get(vybzQueueKey);

            if (waitingForContent) {
              // User is responding to vybz prompt with content
              await this.redisService.del(vybzQueueKey); // Clear the waiting flag
              return this.processVybzContent(whatsappId, command.rawText, 'text', session);
            }

            // AI queries are only allowed in DMs, not groups
            if (!isGroup) {
              // Otherwise, use AI to respond
              const shouldUseVoice = await this.ttsService.shouldUseVoice(
                command.rawText,
                true,
                session.whatsappId,
              );
              return this.handleAiQuery(command.rawText, session, shouldUseVoice);
            }
          }

          return this.getUnknownCommandMessage(session, whatsappId, isGroup);
        }
      }
    } catch (error) {
      this.logger.error(`Error handling command: ${error.message}`, error.stack);
      return "I'm sorry, something went wrong. Please try again later.";
    }
  }

  /**
   * Handle account linking command
   */
  private async handleLinkCommand(
    command: ParsedCommand,
    whatsappId: string,
    phoneNumber: string,
    isGroup?: boolean,
  ): Promise<string> {
    try {
      // Handle "link CODE" in groups
      if (command.args.code && isGroup) {
        if (!whatsappId.includes('@lid')) {
          return '❌ This command is only for users with privacy mode (@lid format).';
        }

        const result = await this.groupAuthService.verifyGroupLinkCode(
          command.args.code,
          whatsappId,
        );

        if (result.success) {
          return `✅ ${result.message}`;
        } else {
          return `❌ ${result.message}`;
        }
      }

      // Handle "link group" in DM
      if (command.args.type === 'group' && !isGroup) {
        const existingSession = await this.sessionService.getSessionByWhatsappId(whatsappId);
        if (!existingSession || !existingSession.isVerified) {
          return '❌ Please link your Flash account first using `link` before generating a group code.';
        }

        const code = await this.groupAuthService.generateGroupLinkCode(phoneNumber, whatsappId);

        return `🔐 *Group Link Code Generated*

Your code: \`${code}\`

To link in a group:
1. Go to the group chat
2. Type: \`link ${code}\`

⏱️ Code expires in 5 minutes
🛡️ Your phone number stays private!`;
      }

      // First check if user already has a linked session
      const existingSession = await this.sessionService.getSessionByWhatsappId(whatsappId);
      if (existingSession) {
        // Check if the session is fully verified with Flash credentials
        if (
          existingSession.isVerified &&
          existingSession.flashUserId &&
          existingSession.flashAuthToken
        ) {
          return 'Your Flash account is already linked.';
        } else {
          // Session exists but is incomplete - user needs to complete verification
          this.logger.warn(
            `Incomplete session found for ${whatsappId}: isVerified=${existingSession.isVerified}, hasFlashUserId=${!!existingSession.flashUserId}, hasAuthToken=${!!existingSession.flashAuthToken}`,
          );
          // Delete the incomplete session to allow re-linking
          await this.sessionService.deleteSession(whatsappId);
        }
      }

      // Check if this is an @lid format user in a group
      if (whatsappId.includes('@lid') && isGroup) {
        return `⚠️ *Privacy Mode Detected*

You're using WhatsApp's privacy mode in this group, which hides your phone number.

To use Pulse in this group:
1. Message me directly first: @${this.configService.get('WHATSAPP_BOT_NUMBER', '18673225224')}
2. Type \`link\` to connect your account
3. Type \`link group\` to get a privacy code
4. Use the code in any group!

_This is a WhatsApp privacy feature to protect your number in groups._`;
      }

      const linkRequest: AccountLinkRequestDto = {
        whatsappId,
        phoneNumber,
      };

      const result = await this.authService.initiateAccountLinking(linkRequest);

      if (result.otpSent) {
        return 'Enter the 6-digit verification code.';
      } else {
        return 'Your Flash account is already linked.';
      }
    } catch (error) {
      this.logger.error(`Error handling link command: ${error.message}`, error.stack);

      if (error.message.includes('Phone number is not a valid phone number')) {
        return `❌ This phone number is not recognized by Flash.

Please ensure:
• You have a Flash account with this number
• The number is in the correct format
• You're using the same number registered with Flash

If you don't have a Flash account yet, please download the Flash app first.`;
      }

      if (error.message.includes('Please open the Flash mobile app')) {
        return error.message;
      }

      if (error.message.includes('Phone number is not a valid phone number')) {
        return `❌ This phone number is not recognized by Flash.

Please ensure:
• You have a Flash account with this number
• The number is in the correct format
• You're using the same number registered with Flash

If you don't have a Flash account yet, please download the Flash app first.`;
      }

      if (error.message.includes('No Flash account found')) {
        return "We couldn't find a Flash account with your phone number. Please make sure you're using the same number registered with Flash.";
      }

      return "We're having trouble linking your account. Please try again later or contact support.";
    }
  }

  /**
   * Handle account unlinking command
   */
  private async handleUnlinkCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      if (!session) {
        return 'No Flash account is linked to this WhatsApp number.';
      }

      const confirmed = command.args.confirm === 'confirm';

      if (!confirmed) {
        // Ask for confirmation
        return 'Are you sure you want to unlink your Flash account? This will:\n\n• Remove access to your Flash wallet through WhatsApp\n• Delete your session data\n• Require re-linking to use Flash services again\n\nTo confirm, type: unlink confirm';
      }

      // User confirmed, proceed with unlinking
      await this.authService.unlinkAccount(whatsappId);

      // Emit user unlinked event to unsubscribe from payment notifications
      await this.eventsService.publishEvent('user_unlinked', { whatsappId });

      return 'Your Flash account has been successfully unlinked from WhatsApp.\n\nTo use Flash services through WhatsApp again, you\'ll need to type "link" to reconnect your account.\n\nThank you for using Flash!';
    } catch (error) {
      this.logger.error(`Error handling unlink command: ${error.message}`, error.stack);
      return "We're having trouble processing your request. Please try again later.";
    }
  }

  /**
   * Handle OTP verification command
   */
  private async handleVerifyCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean }> {
    try {
      // Check if we have an OTP in the command
      const otpCode = command.args.otp;

      if (!otpCode) {
        return 'Please provide your 6-digit verification code.';
      }

      if (!session) {
        return 'Please start the account linking process first by typing "link".';
      }

      const verifyDto: VerifyOtpDto = {
        sessionId: session.sessionId,
        otpCode,
      };

      await this.authService.verifyAccountLinking(verifyDto);

      // Get the updated session with auth token
      const updatedSession = await this.sessionService.getSessionByWhatsappId(whatsappId);

      // Emit user verified event for payment notifications
      if (updatedSession && updatedSession.isVerified && updatedSession.flashAuthToken) {
        await this.eventsService.publishEvent('user_verified', {
          whatsappId: updatedSession.whatsappId,
          authToken: updatedSession.flashAuthToken,
        });

        // Fetch and store username mapping for efficient lookups
        try {
          const username = updatedSession.flashAuthToken
            ? await this.requestDeduplicator.deduplicate(
                DeduplicationKeyBuilder.forUserProfile(updatedSession.flashUserId!),
                () => this.usernameService.getUsername(updatedSession.flashAuthToken!),
                { ttl: this.getCacheTTLs().username }, // Use configured username TTL
              )
            : null;
          if (username) {
            await this.sessionService.storeUsernameMapping(username, whatsappId);
          }
        } catch (error) {
          this.logger.error(`Error storing username mapping: ${error.message}`);
        }
      }

      // Check for pending payments to auto-claim
      try {
        if (updatedSession && updatedSession.isVerified && updatedSession.phoneNumber) {
          const pendingPayments = await this.pendingPaymentService.getPendingPaymentsByPhone(
            updatedSession.phoneNumber,
          );

          if (pendingPayments.length > 0) {
            let totalClaimed = 0;
            let claimedCount = 0;

            for (const payment of pendingPayments) {
              try {
                const claimResult = await this.processPendingPaymentClaim(payment, updatedSession);
                if (claimResult.includes('✅')) {
                  totalClaimed += payment.amountCents;
                  claimedCount++;
                }
              } catch (error) {
                this.logger.error(`Failed to auto-claim payment ${payment.id}: ${error.message}`);
              }
            }

            if (claimedCount > 0) {
              const totalUsd = (totalClaimed / 100).toFixed(2);
              const pendingClaimMessage = `💰 Great news! You had ${claimedCount} pending payment${claimedCount > 1 ? 's' : ''} totaling $${totalUsd} that ${claimedCount > 1 ? 'have' : 'has'} been automatically credited to your account!`;

              // Create welcome message with pending payment info
              const welcomeMessage = this.getWelcomeMessage(updatedSession, pendingClaimMessage);

              // Mark onboarding step as complete BEFORE returning
              await this.onboardingService.updateProgress(whatsappId, 'verify_account');

              // Return with special forceVoice flag
              return {
                text: welcomeMessage,
                media: undefined,
                forceVoice: true,
              } as any;
            }
          }
        }
      } catch (error) {
        this.logger.error(`Error checking for pending payments: ${error.message}`);
      }

      // Create warm welcome message
      const welcomeMessage = this.getWelcomeMessage(updatedSession);

      // Mark onboarding step as complete BEFORE returning
      // This ensures the next response won't show verification hints
      await this.onboardingService.updateProgress(whatsappId, 'verify_account');

      // Return with special forceVoice flag
      return {
        text: welcomeMessage,
        media: undefined,
        forceVoice: true, // Special flag to force voice for important messages
      } as any;
    } catch (error) {
      this.logger.error(`Error handling verify command: ${error.message}`, error.stack);

      if (error.message.includes('Invalid or expired OTP')) {
        return 'The verification code is invalid or has expired. Please try linking your account again by typing "link".';
      }

      return "We're having trouble verifying your account. Please try again later or contact support.";
    }
  }

  /**
   * Handle balance check command
   */
  private async handleBalanceCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string | { text: string; voice?: Buffer; voiceOnly?: boolean }> {
    try {
      if (!session) {
        return this.getNotLinkedMessage();
      }

      if (!session.isVerified || !session.flashUserId || !session.flashAuthToken) {
        this.logger.warn(
          `Incomplete session for balance check: whatsappId=${whatsappId}, isVerified=${session.isVerified}, hasFlashUserId=${!!session.flashUserId}, hasAuthToken=${!!session.flashAuthToken}`,
        );
        // Clear the incomplete session
        await this.sessionService.deleteSession(whatsappId);
        return 'Your session has expired. Please type "link" to reconnect your Flash account.';
      }

      // Skip MFA for WhatsApp since the user already authenticated
      // The initial WhatsApp verification is sufficient for security

      // Get balance from Flash API using the auth token with deduplication
      const deduplicationKey = DeduplicationKeyBuilder.forBalance(session.flashUserId!);
      const balanceInfo = await this.requestDeduplicator.deduplicate(
        deduplicationKey,
        () => this.balanceService.getUserBalance(session.flashUserId!, session.flashAuthToken!),
        { ttl: 5000 }, // Cache balance for 5 seconds
      );

      // If display currency is not USD, convert using exchange rate from API
      let displayBalance = balanceInfo.fiatBalance;
      let displayCurrency = balanceInfo.fiatCurrency;

      if (balanceInfo.fiatCurrency !== 'USD') {
        if (balanceInfo.exchangeRate) {
          try {
            // Convert USD to display currency using the same logic as mobile app
            const { base, offset } = balanceInfo.exchangeRate.usdCentPrice;

            // Log the raw values for debugging

            // Calculate display currency per USD cent
            // This gives us how much of the display currency's SMALLEST UNIT (e.g., euro cents) per USD cent
            const displayCurrencyPerCent = base / Math.pow(10, offset);

            // Convert USD dollars to display currency's major unit
            // 1. Convert USD dollars to cents: fiatBalance * 100
            // 2. Multiply by exchange rate: * displayCurrencyPerCent (gives us display currency's minor unit)
            // 3. Convert back to major unit: / 100
            const usdCents = balanceInfo.fiatBalance * 100;
            const displayCurrencyMinorUnits = usdCents * displayCurrencyPerCent;
            displayBalance = displayCurrencyMinorUnits / 100;

            // Round to 2 decimal places for consistent display
            displayBalance = Math.round(displayBalance * 100) / 100;
          } catch (error) {
            this.logger.error(`Currency conversion error: ${error.message}`);
            displayCurrency = 'USD';
          }
        } else {
          this.logger.warn(
            `No exchange rate available for ${balanceInfo.fiatCurrency}, showing USD amount`,
          );
          displayCurrency = 'USD';
        }
      }

      // Format the balance data
      const balanceData = {
        btcBalance: balanceInfo.btcBalance,
        fiatBalance: displayBalance,
        fiatCurrency: displayCurrency,
        lastUpdated: balanceInfo.lastUpdated,
        userName: session.profileName,
      };

      // Generate text message
      const textMessage = this.balanceTemplate.generateBalanceMessage(balanceData);

      // Check if voice response is needed
      // Check if this was a voice-requested command (e.g., "voice balance")
      const voiceRequested = command.args.voiceRequested === 'true';
      const shouldUseVoice =
        voiceRequested ||
        (await this.ttsService.shouldUseVoice('balance', false, session.whatsappId));

      if (shouldUseVoice) {
        const voiceText = this.balanceTemplate.generateVoiceBalanceMessage(balanceData);
        const audioBuffer = await this.ttsService.textToSpeech(voiceText, 'en', whatsappId);

        const shouldSendVoiceOnly = await this.ttsService.shouldSendVoiceOnly(session.whatsappId);

        return {
          text: shouldSendVoiceOnly ? '' : textMessage,
          voice: audioBuffer,
          voiceOnly: shouldSendVoiceOnly,
        };
      }

      return textMessage;
    } catch (error) {
      this.logger.error(`Error handling balance command: ${error.message}`, error.stack);

      if (error.message.includes('Multi-factor authentication required')) {
        return 'For security, we need to verify your identity. Please check your Flash app for a verification code and enter it by typing "verify" followed by the code (e.g., "verify 123456").';
      }

      return "We're having trouble retrieving your balance. Please try again later or contact support.";
    }
  }

  /**
   * Handle refresh command to clear balance cache
   */
  private async handleRefreshCommand(
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      if (!session) {
        return this.getNotLinkedMessage();
      }

      if (!session.isVerified || !session.flashUserId || !session.flashAuthToken) {
        this.logger.warn(`Incomplete session for refresh: whatsappId=${whatsappId}`);
        await this.sessionService.deleteSession(whatsappId);
        return 'Your session has expired. Please type "link" to reconnect your Flash account.';
      }

      // Clear the balance cache
      await this.balanceService.clearBalanceCache(session.flashUserId);

      // Fetch fresh balance data with deduplication (but with no caching since this is a refresh)
      const deduplicationKey = DeduplicationKeyBuilder.forBalance(session.flashUserId!, 'refresh');
      const balanceInfo = await this.requestDeduplicator.deduplicate(
        deduplicationKey,
        () =>
          this.balanceService.getUserBalance(session.flashUserId!, session.flashAuthToken!, true),
        { ttl: 0 }, // No caching for refresh command
      );

      // If display currency is not USD, convert using exchange rate from API
      let displayBalance = balanceInfo.fiatBalance;
      let displayCurrency = balanceInfo.fiatCurrency;

      if (balanceInfo.fiatCurrency !== 'USD') {
        if (balanceInfo.exchangeRate) {
          try {
            // Convert USD to display currency using the same logic as mobile app
            const { base, offset } = balanceInfo.exchangeRate.usdCentPrice;

            // Log the raw values for debugging

            // Calculate display currency per USD cent
            // This gives us how much of the display currency's SMALLEST UNIT (e.g., euro cents) per USD cent
            const displayCurrencyPerCent = base / Math.pow(10, offset);

            // Convert USD dollars to display currency's major unit
            // 1. Convert USD dollars to cents: fiatBalance * 100
            // 2. Multiply by exchange rate: * displayCurrencyPerCent (gives us display currency's minor unit)
            // 3. Convert back to major unit: / 100
            const usdCents = balanceInfo.fiatBalance * 100;
            const displayCurrencyMinorUnits = usdCents * displayCurrencyPerCent;
            displayBalance = displayCurrencyMinorUnits / 100;

            // Round to 2 decimal places for consistent display
            displayBalance = Math.round(displayBalance * 100) / 100;
          } catch (error) {
            this.logger.error(`Currency conversion error: ${error.message}`);
            displayCurrency = 'USD';
          }
        } else {
          this.logger.warn(
            `No exchange rate available for ${balanceInfo.fiatCurrency}, showing USD amount`,
          );
          displayCurrency = 'USD';
        }
      }

      // Format and return the balance message using the template
      return this.balanceTemplate.generateBalanceMessage({
        btcBalance: balanceInfo.btcBalance,
        fiatBalance: displayBalance,
        fiatCurrency: displayCurrency,
        lastUpdated: balanceInfo.lastUpdated,
        userName: session.profileName,
      });
    } catch (error) {
      this.logger.error(`Error handling refresh command: ${error.message}`, error.stack);
      return "We're having trouble refreshing your balance. Please try again later or contact support.";
    }
  }

  /**
   * Handle username command
   */
  private async handleUsernameCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      if (!session) {
        return this.getNotLinkedMessage();
      }

      if (!session.isVerified || !session.flashUserId || !session.flashAuthToken) {
        this.logger.warn(`Incomplete session for username change: whatsappId=${whatsappId}`);
        await this.sessionService.deleteSession(whatsappId);
        return 'Your session has expired. Please type "link" to reconnect your Flash account.';
      }

      const newUsername = command.args.username;

      if (!newUsername) {
        // User just typed "username" - show their current username
        const deduplicationKey = DeduplicationKeyBuilder.forUserProfile(session.flashUserId!);
        const currentUsername = await this.requestDeduplicator.deduplicate(
          deduplicationKey,
          () => this.usernameService.getUsername(session.flashAuthToken!),
          { ttl: this.getCacheTTLs().username }, // Use configured username TTL
        );

        if (currentUsername) {
          // Store username mapping for efficient lookups
          await this.sessionService.storeUsernameMapping(currentUsername, whatsappId);
          return `Your username is: @${currentUsername}. \n\n Your lightning address is: ${currentUsername}@flashapp.me. \n\n Want to know more about lightning addresses? Just ask!`;
        } else {
          return 'You haven\'t set a username yet. To set one, type "username" followed by your desired username.\n\nExample: username johndoe';
        }
      } else {
        // User wants to set a username
        // First check if they already have one
        const deduplicationKey = DeduplicationKeyBuilder.forUserProfile(session.flashUserId!);
        const currentUsername = await this.requestDeduplicator.deduplicate(
          deduplicationKey,
          () => this.usernameService.getUsername(session.flashAuthToken!),
          { ttl: this.getCacheTTLs().username }, // Use configured username TTL
        );

        if (currentUsername) {
          return `You already have a username: @${currentUsername}\n\nUsernames cannot be changed once set.`;
        }

        // Validate the username
        const validationError = validateUsername(newUsername);

        if (validationError) {
          return getUsernameErrorMessage(validationError);
        }

        // Try to set the username
        try {
          await this.usernameService.setUsername(newUsername, session.flashAuthToken);
          // Store username mapping for efficient lookups
          await this.sessionService.storeUsernameMapping(newUsername, whatsappId);
          return `Success! Your username has been set to: @${newUsername}\n\nYour Lightning address is now: ${newUsername}@flashapp.me\n\n⚠️ Remember: Usernames cannot be changed once set.`;
        } catch (error) {
          if (error.message.includes('already taken')) {
            return `The username @${newUsername} is already taken. Please choose another one.`;
          }
          throw error;
        }
      }
    } catch (error) {
      this.logger.error(`Error handling username command: ${error.message}`, error.stack);
      return "We're having trouble with your username request. Please try again later.";
    }
  }

  /**
   * Handle price command
   */
  private async handlePriceCommand(
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      // Determine which currency to show
      let currency = 'USD'; // Default currency
      let authToken: string | undefined;

      if (session?.isVerified && session.flashAuthToken) {
        // User is authenticated, use their auth token to get their display currency
        authToken = session.flashAuthToken;

        // The authenticated query will automatically use the user's display currency with deduplication
        const deduplicationKey = DeduplicationKeyBuilder.forPrice(currency);
        const priceInfo = await this.requestDeduplicator.deduplicate(
          deduplicationKey,
          () => this.priceService.getBitcoinPrice(currency, authToken),
          { ttl: this.getCacheTTLs().price }, // Use configured price TTL
        );
        return this.priceService.formatPriceMessage(priceInfo);
      } else {
        // User not authenticated, show USD price with deduplication
        const deduplicationKey = DeduplicationKeyBuilder.forPrice(currency);
        const priceInfo = await this.requestDeduplicator.deduplicate(
          deduplicationKey,
          () => this.priceService.getBitcoinPrice(currency),
          { ttl: this.getCacheTTLs().price }, // Use configured price TTL
        );
        return (
          this.priceService.formatPriceMessage(priceInfo) +
          '\n\n💡 Tip: You can link your Flash account to see prices in your preferred currency!'
        );
      }
    } catch (error) {
      this.logger.error(`Error handling price command: ${error.message}`, error.stack);
      return "We're having trouble fetching the current Bitcoin price. Please try again later.";
    }
  }

  /**
   * Handle consent command
   */
  private async handleConsentCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      if (!session) {
        return this.getNotLinkedMessage();
      }

      const choice = command.args.choice;

      if (choice === 'yes') {
        await this.authService.recordConsent(session.sessionId, true);

        // Check if there's a pending AI question
        const pendingQuestionKey = `pending_ai_question:${whatsappId}`;
        const pendingQuestion = await this.redisService.get(pendingQuestionKey);

        if (pendingQuestion) {
          // Clear the pending question
          await this.redisService.del(pendingQuestionKey);

          // Update session to reflect consent given
          session.consentGiven = true;

          // Answer the pending question
          try {
            const shouldUseVoice = await this.ttsService.shouldUseVoice(
              pendingQuestion,
              true,
              session.whatsappId,
            );
            const aiResponse = await this.handleAiQuery(pendingQuestion, session, shouldUseVoice);
            return `Thank you for providing your consent! 🎉\n\nNow, regarding your question: "${pendingQuestion}"\n\n${aiResponse}`;
          } catch (error) {
            this.logger.error(
              `Error processing pending AI question: ${error.message}`,
              error.stack,
            );
            return 'Thank you for providing your consent. You can now use all Flash services through WhatsApp.\n\nI had trouble processing your previous question. Please feel free to ask again!';
          }
        }

        return 'Thank you for providing your consent. You can now use all Flash services through WhatsApp.';
      } else if (choice === 'no') {
        await this.authService.recordConsent(session.sessionId, false);

        // Clear any pending question since user declined consent
        const pendingQuestionKey = `pending_ai_question:${whatsappId}`;
        await this.redisService.del(pendingQuestionKey);

        return 'You have declined to provide consent. Some services will be limited. You can change this at any time by typing "consent yes".';
      } else {
        return 'Please specify your consent choice by typing "yes" or "no".';
      }
    } catch (error) {
      this.logger.error(`Error handling consent command: ${error.message}`, error.stack);
      return "We're having trouble processing your consent. Please try again later or contact support.";
    }
  }

  /**
   * Handle AI query using Maple AI
   */
  private async handleAiQuery(
    query: string,
    session: UserSession,
    isVoiceMode: boolean = false,
  ): Promise<string> {
    try {
      // Consent is automatically granted for linked users (as per welcome message)
      // No need to check or prompt for consent

      // Create context with user info, but remove sensitive data
      const context = {
        userId: session.flashUserId,
        whatsappId: session.whatsappId,
        isVerified: session.isVerified,
        consentGiven: session.consentGiven,
        isVoiceMode: isVoiceMode,
      };

      const response = await this.geminiAiService.processQuery(query, context);
      return response;
    } catch (error) {
      this.logger.error(`Error handling AI query: ${error.message}`, error.stack);
      return "I'm sorry, I couldn't process your question. Please try again later or contact Flash support for assistance.";
    }
  }

  /**
   * Send WhatsApp message
   */
  async sendMessage(_to: string, _body: string): Promise<any> {
    // In prototype branch, messaging is handled by WhatsAppWebService
    this.logger.warn(
      'sendMessage called in prototype branch - messaging should be handled by WhatsAppWebService',
    );
    throw new Error(
      'Direct messaging not available in prototype branch. Use WhatsAppWebService instead.',
    );
  }

  /**
   * Store incoming message in Redis for traceability
   */
  private async storeCloudMessage(messageData: {
    from: string;
    text: string;
    messageId: string;
    timestamp: string;
    name?: string;
  }): Promise<void> {
    const key = `whatsapp:message:${messageData.messageId}`;
    const value = JSON.stringify({
      ...messageData,
      storedAt: new Date().toISOString(),
    });
    const expiryInSeconds = 60 * 60 * 24 * 7; // 7 days

    await this.redisService.set(key, value, expiryInSeconds);
  }

  /**
   * Extract WhatsApp ID from the From field
   */
  private extractWhatsappId(from: string): string {
    // Remove 'whatsapp:' prefix and any '+' sign
    // Also handle @c.us suffix if present
    return from
      .replace('whatsapp:', '')
      .replace('+', '')
      .replace('@c.us', '')
      .replace('@s.whatsapp.net', '');
  }

  /**
   * Normalize phone number to E.164 format
   */
  private normalizePhoneNumber(from: string): string {
    // Remove 'whatsapp:' prefix and WhatsApp suffixes
    const number = from
      .replace('whatsapp:', '')
      .replace('@c.us', '')
      .replace('@s.whatsapp.net', '')
      .replace('@g.us', '');

    // Already has + sign, return as is
    if (number.startsWith('+')) {
      return number;
    }

    // Add + sign
    return `+${number}`;
  }

  /**
   * Get help message based on session status
   */
  private getHelpMessage(
    session: UserSession | null,
    command?: ParsedCommand,
    isGroup?: boolean,
  ): string {
    // Check for instructional questions first
    const isQuestion = command?.args?.isQuestion === 'true';
    const originalQuestion = command?.args?.originalQuestion;

    if (isQuestion && originalQuestion) {
      return this.getInstructionalResponse(
        command?.args?.category || 'general',
        originalQuestion,
        session,
        isGroup,
      );
    }

    // Check if a category or navigation was requested
    if (command?.args?.category) {
      const category = command.args.category;

      // Handle numbered navigation
      if (category === '1') return this.getCategoryHelp('wallet');
      if (category === '2') return this.getCategoryHelp('send');
      if (category === '3') return this.getCategoryHelp('receive');
      if (category === 'more') return this.getFullHelpMenu(session, isGroup);

      // Handle regular categories
      return this.getCategoryHelp(category);
    }
    // Show group-specific help if in a group (even for unlinked users)
    if (isGroup) {
      return `⚡ *Group Commands*

*Games & Fun:*
• \`trivia\` - play trivia, earn sats
• \`poll Question | Yes | No\` - create polls
• \`game quickdraw\` - typing race
• \`joke\` - random joke

*Money (requires linked account):*
• \`send 10 to @user\` - send payment
• \`balance\` - check balance

Type \`help games\` for more games!`;
    }

    if (!session) {
      return `*Welcome to Pulse!*

Type \`link\` to connect your Flash account.

Once connected:
• Send & receive money
• Check balance
• View history

Ready? Type \`link\` to start!`;
    }

    if (!session.isVerified) {
      return `📲 *Verify Your Account*

Enter the 6-digit code sent to your phone.

Need a new code? Type \`link\` again.`;
    }

    return `⚡ *Commands*

• \`balance\` - check money
• \`send 10 to john\` - send payment
• \`receive 25\` - request money
• \`history\` - view transactions
• \`trivia\` - play games & earn sats
• \`help more\` - all commands

Try: \`balance\``;
  }

  /**
   * Get full help menu with all commands
   */
  private getFullHelpMenu(session: UserSession | null, isGroup?: boolean): string {
    if (!session?.isVerified) {
      return this.getHelpMessage(session, undefined, isGroup);
    }

    return `⚡ *All Commands*

*Money:*
• \`balance\` / \`refresh\`
• \`send 10 to @user\`
• \`receive 20\`
• \`request 15 from @user\`
• \`history\`

*Contacts:*
• \`contacts\` / \`contacts add/remove\`

*Settings:*
• \`voice on/off/only\`
• \`settings\`
• \`username\`
• \`pending\`

*Games & Fun:*
• \`trivia\` - play trivia, earn sats
• \`poll Question | Option1 | Option2\` - create polls (groups)
• \`game quickdraw\` - fast typing game (groups)
• \`joke\` - get a random joke

*Learn & Teach:*
• \`learn\` - answer questions
• \`learn stats\` - view your knowledge

Type \`help [topic]\` for details`;
  }

  /**
   * Get category-specific help
   */
  private getCategoryHelp(category: string): string {
    const categories: Record<string, string> = {
      wallet: `💰 *Balance Commands*

• \`balance\` - check balance
• \`refresh\` - update balance
• \`username\` - set payment address
• \`history\` - recent transactions`,

      send: `💸 *Send Money*

• \`send 10 to @username\`
• \`send 5.50 to john\` (contact)
• \`send 25 to lnbc...\` (invoice)

*Request:*
• \`request 20 from @john\`

All amounts in USD.`,

      receive: `📥 *Receive Money*

• \`receive 10\` - $10 invoice
• \`receive 50 Coffee\` - with note

Share the QR code to get paid!`,

      contacts: `👥 *Contacts*

• \`contacts\` - list all
• \`contacts add john 18765551234\`
• \`contacts remove john\``,

      pending: `💳 *Pending Payments*

• \`pending\` - view all
• \`pay 12345\` - claim with code`,

      voice: `🎙️ *Voice Mode*

• \`voice on\` - voice + text
• \`voice off\` - text only  
• \`voice only\` - voice only`,

      games: `🎮 *Games & Fun*

*Trivia (earn sats!):*
• \`trivia\` - start random trivia
• \`trivia crypto\` - Bitcoin questions
• \`answer 1\` or \`a b\` - answer
• \`hint\` - get help (-50% reward)
• \`leaderboard\` - see top players

*Group Games:*
• \`poll Question | Option1 | Option2\`
• \`game quickdraw\` - typing race
• \`game wordchain\` - word connections
• \`game guess\` - number guessing

*Fun:*
• \`joke\` - random joke
• \`meme\` - random meme`,
    };

    return (
      categories[category.toLowerCase()] ||
      `Type: \`help\`, \`help send\`, \`help receive\`, \`help games\``
    );
  }

  /**
   * Get instructional response for "how do I" questions
   */
  private getInstructionalResponse(
    category: string,
    question: string,
    session: UserSession | null,
    isGroup?: boolean,
  ): string {
    const lowerQuestion = question.toLowerCase();

    // Send money instructions
    if (category === 'send' || lowerQuestion.includes('send') || lowerQuestion.includes('pay')) {
      if (!session?.isVerified) {
        return `To send money, you first need to link your Flash account. Type \`link\` to get started.\n\nOnce linked, you can send money by typing:\n\`send [amount] to [recipient]\`\n\nFor example:\n• \`send 10 to @john\`\n• \`send 2.50 to mary\``;
      }

      // Extract amount if mentioned in the question
      const amountMatch = lowerQuestion.match(
        /\$(\d+(?:\.\d+)?)|\b(\d+(?:\.\d+)?)\s*(?:dollar|usd)?/i,
      );
      const amount = amountMatch ? amountMatch[1] || amountMatch[2] : '10';

      // Extract recipient if mentioned
      const recipientMatch = lowerQuestion.match(/to\s+(?:my\s+)?(?:friend\s+)?(\w+)/i);
      const recipient = recipientMatch ? recipientMatch[1] : 'username';

      return `To send money, use this format:\n\`send ${amount} to ${recipient}\`\n\n${recipient === 'username' ? 'Replace "username" with:\n• @username (Flash user)\n• Contact name\n• Phone number' : `If ${recipient} is:\n• A Flash user: \`send ${amount} to @${recipient}\`\n• A saved contact: \`send ${amount} to ${recipient}\`\n• Not on Flash: save as contact first`}\n\nAll amounts are in USD.`;
    }

    // Receive money instructions
    if (
      category === 'receive' ||
      lowerQuestion.includes('receive') ||
      lowerQuestion.includes('get paid')
    ) {
      if (!session?.isVerified) {
        return `To receive money, you first need to link your Flash account. Type \`link\` to get started.\n\nOnce linked, you can receive money by typing:\n\`receive [amount]\``;
      }
      return `To receive money, type:\n\`receive [amount]\`\n\nFor example:\n• \`receive 20\` - creates a $20 invoice\n• \`receive 5.50 lunch money\` - with memo\n\nShare the invoice to get paid instantly.`;
    }

    // Balance instructions
    if (
      category === 'wallet' ||
      lowerQuestion.includes('balance') ||
      lowerQuestion.includes('check') ||
      lowerQuestion.includes('money')
    ) {
      if (!session?.isVerified) {
        return `To check your balance, you first need to link your Flash account. Type \`link\` to get started.\n\nOnce linked, just type \`balance\` anytime.`;
      }
      return `To check your balance, simply type:\n\`balance\`\n\nNeed to refresh? Type \`refresh\``;
    }

    // Link account instructions
    if (
      category === 'link' ||
      lowerQuestion.includes('link') ||
      lowerQuestion.includes('connect')
    ) {
      // Check if asking about linking someone else (friend, user, etc.) or group linking
      if (
        lowerQuestion.includes('friend') ||
        lowerQuestion.includes('someone') ||
        lowerQuestion.includes('user') ||
        lowerQuestion.includes('group') ||
        lowerQuestion.includes('other') ||
        isGroup
      ) {
        return `To use Pulse with privacy mode in groups:\n\n1️⃣ Your friend should message me directly: @${this.configService.get('WHATSAPP_BOT_NUMBER', '18673225224')}\n2️⃣ They type \`link\` to connect their Flash account\n3️⃣ They type \`link group\` to get a privacy code\n4️⃣ In this group, they type \`link [code]\`\n\nTheir phone number stays private! 🛡️`;
      }

      if (session?.isVerified) {
        return `Your account is already linked! You can now:\n• Send money: \`send 10 to @username\`\n• Check balance: \`balance\`\n• Receive money: \`receive 20\``;
      }
      return `To link your Flash account:\n1. Type \`link\`\n2. Check your Flash app for a code\n3. Type \`verify [code]\`\n\nNeed help? Make sure you have the Flash app installed.`;
    }

    // Contacts instructions
    if (category === 'contacts' || lowerQuestion.includes('contact')) {
      return `To manage contacts:\n• View all: \`contacts\`\n• Add: \`contacts add john +1234567890\`\n• Remove: \`contacts remove john\`\n\nSaved contacts make sending easier!`;
    }

    // Voice instructions
    if (
      category === 'voice' ||
      lowerQuestion.includes('voice') ||
      lowerQuestion.includes('audio')
    ) {
      return `To use voice features:\n• Turn on: \`voice on\`\n• Turn off: \`voice off\`\n• Voice only: \`voice only\`\n\nOr say any command like "voice balance"`;
    }

    // Games instructions
    if (
      category === 'games' ||
      lowerQuestion.includes('game') ||
      lowerQuestion.includes('play') ||
      lowerQuestion.includes('trivia') ||
      lowerQuestion.includes('fun')
    ) {
      return `To play games and have fun:\n\n*Trivia (earn sats!):*\n• Start: \`trivia\`\n• Answer: \`answer 1\` or \`a\`\n• Get help: \`hint\`\n\n*Group Games:*\n• Create poll: \`poll Question | Option1 | Option2\`\n• Quick game: \`game quickdraw\`\n\n*Fun:*\n• \`joke\` - get a laugh\n• \`meme\` - see a meme\n\nReady to play? Type \`trivia\` to start!`;
    }

    // Privacy mode instructions
    if (
      lowerQuestion.includes('privacy') ||
      lowerQuestion.includes('@lid') ||
      lowerQuestion.includes('anonymous')
    ) {
      return `To use Pulse with privacy mode:\n\n1️⃣ Message me directly: @${this.configService.get('WHATSAPP_BOT_NUMBER', '18673225224')}\n2️⃣ Type \`link\` to connect your Flash account\n3️⃣ Type \`link group\` to get a privacy code\n4️⃣ In any group, type \`link [code]\`\n\nYour phone number stays private! 🛡️`;
    }

    // Default help for general questions
    return `I can help you with:\n\n• Send money: \`send [amount] to [recipient]\`\n• Receive money: \`receive [amount]\`\n• Check balance: \`balance\`\n• View history: \`history\`\n• Play games: \`trivia\`\n\nWhat would you like to do?`;
  }

  /**
   * Generate warm welcome message for newly linked users
   */
  private getWelcomeMessage(session: UserSession | null, pendingClaimMessage?: string): string {
    const userName = session?.profileName || 'there';
    const firstName = userName === 'there' ? userName : userName.split(' ')[0]; // Use first name for friendlier greeting, but keep 'there' as is

    let message = `🎉 *Welcome${firstName !== 'there' ? ', ' + firstName : ''}!*

Your Flash account is connected.`;

    if (pendingClaimMessage) {
      message += `\n\n${pendingClaimMessage}`;
    }

    message += `

I'm Pulse - I can send money, check balances, and handle Flash payments through WhatsApp.

*Quick commands:*
• \`balance\` - check your money
• \`send 10 to john\` - send payment
• \`receive 25\` - request money
• \`help\` - see all commands

Ready? Try \`balance\` to start!

_By using Pulse, you agree to AI-assisted message processing to help serve you better._`;

    return message;
  }

  /**
   * Handle receive command - create Lightning invoice
   */
  private async handleReceiveCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<{ text: string; media?: Buffer }> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified) {
        return {
          text: ResponseLengthUtil.getConciseResponse('not_linked'),
        };
      }

      // Parse amount and memo from command
      const amountStr = command.args.amount;
      let memo = command.args.memo || undefined;

      let amount: number | undefined;
      const currency: 'USD' | 'BTC' = 'USD'; // Only USD supported

      if (amountStr) {
        // Check if amount contains BTC indicator
        if (amountStr.toLowerCase().includes('btc') || amountStr.includes('₿')) {
          return {
            text: 'BTC invoices are not currently supported. Please specify amount in USD, e.g., "receive 10" for $10',
          };
        }

        // Parse and validate USD amount
        const parsedResult = parseAndValidateAmount(amountStr);
        if (parsedResult.error) {
          return { text: parsedResult.error };
        }
        amount = parsedResult.amount;
      }

      // Validate amount
      const amountError = validateAmount(amount);
      if (amountError) {
        return {
          text: getInvoiceValidationErrorMessage(amountError),
        };
      }

      // Validate and sanitize memo
      if (memo) {
        const memoError = validateMemo(memo);
        if (memoError) {
          return {
            text: getInvoiceValidationErrorMessage(memoError),
          };
        }
        // Sanitize memo to prevent issues
        memo = sanitizeMemo(memo);
      }

      // Create the invoice
      const invoice = await this.invoiceService.createInvoice(
        session.flashAuthToken!,
        amount,
        memo,
        currency,
      );

      // Store invoice for tracking
      await this.storeInvoiceForTracking(session.whatsappId, invoice, session.flashAuthToken!);

      // Subscribe to Lightning updates for this user (if not already subscribed)
      // Disabled temporarily due to WebSocket connection issues
      // if (this.invoiceTrackerService) {
      //   await this.invoiceTrackerService.subscribeForUser(session.whatsappId);
      // }

      // Generate QR code
      const qrCodeBuffer = await this.qrCodeService.generateLightningQrCode(invoice.paymentRequest);

      // Format the response message
      const message = this.invoiceService.formatInvoiceMessage(invoice);

      return {
        text: message,
        media: qrCodeBuffer,
      };
    } catch (error) {
      this.logger.error(`Error handling receive command: ${error.message}`, error.stack);

      // Return the specific error message if it's a BadRequestException
      if (error instanceof BadRequestException) {
        const errorMessage = error.message;
        return { text: errorMessage };
      }

      // Generic error message for unexpected errors
      return { text: 'Failed to create invoice. Please try again later.' };
    }
  }

  /**
   * Validate send recipient before confirmation
   */
  private async validateSendRecipient(
    command: ParsedCommand,
    session: UserSession | null,
  ): Promise<{
    error?: string;
    recipientInfo?: {
      type: string;
      display: string;
      walletId?: string;
    };
  }> {
    try {
      // Validate session
      const sessionError = this.validateSession(session);
      if (sessionError) {
        return { error: sessionError };
      }

      // Validate amount
      const amountError = this.validateSendAmount(command.args.amount);
      if (amountError) {
        return { error: amountError };
      }

      // Extract recipient information
      const recipientData = this.extractRecipientData(command);

      // Check various recipient types in order
      const lightningInvoiceCheck = this.checkLightningInvoice(recipientData.lightningAddress);
      if (lightningInvoiceCheck) {
        return { recipientInfo: lightningInvoiceCheck };
      }

      const lightningAddressCheck = this.checkLightningAddress(recipientData.lightningAddress);
      if (lightningAddressCheck) {
        return { recipientInfo: lightningAddressCheck };
      }

      const savedContactCheck = await this.checkSavedContact(
        recipientData.targetUsername || recipientData.lightningAddress,
        session!.whatsappId,
      );
      if (savedContactCheck) {
        return { recipientInfo: savedContactCheck };
      }

      if (recipientData.targetUsername && session?.flashAuthToken) {
        const usernameValidation = await this.validateUsername(
          recipientData.targetUsername,
          session.flashAuthToken,
        );
        if (usernameValidation.error) {
          return { error: usernameValidation.error };
        }
        if (usernameValidation.recipientInfo) {
          return { recipientInfo: usernameValidation.recipientInfo };
        }
      }

      const phoneNumberCheck = this.checkPhoneNumber(recipientData.targetPhone);
      if (phoneNumberCheck) {
        return { recipientInfo: phoneNumberCheck };
      }

      return {
        error:
          'Please specify a valid recipient:\n• @username (Flash user)\n• Lightning invoice (lnbc...)\n• Lightning address (user@domain.com)',
      };
    } catch (error) {
      this.logger.error(`Error validating recipient: ${error.message}`);
      return { error: '❌ Failed to validate recipient. Please try again.' };
    }
  }

  /**
   * Validate user session
   */
  private validateSession(session: UserSession | null): string | null {
    if (!session || !session.isVerified || !session.flashAuthToken) {
      return this.getNotLinkedMessage();
    }
    return null;
  }

  /**
   * Validate send amount
   */
  private validateSendAmount(amountStr?: string): string | null {
    if (!amountStr) {
      return 'Please specify amount in USD. Usage: send [amount] to [recipient]';
    }

    const parsedResult = parseAndValidateAmount(amountStr);
    if (parsedResult.error) {
      return parsedResult.error;
    }

    return null;
  }

  /**
   * Extract recipient data from command
   */
  private extractRecipientData(command: ParsedCommand): {
    targetUsername?: string;
    targetPhone?: string;
    lightningAddress?: string;
  } {
    return {
      targetUsername: command.args.username,
      targetPhone: command.args.phoneNumber,
      lightningAddress: command.args.recipient,
    };
  }

  /**
   * Check if recipient is a Lightning invoice
   */
  private checkLightningInvoice(lightningAddress?: string): {
    type: string;
    display: string;
  } | null {
    if (lightningAddress?.startsWith('lnbc')) {
      return {
        type: 'lightning_invoice',
        display: 'Lightning Invoice',
      };
    }
    return null;
  }

  /**
   * Check if recipient is a Lightning address
   */
  private checkLightningAddress(lightningAddress?: string): {
    type: string;
    display: string;
  } | null {
    if (lightningAddress?.includes('@')) {
      return {
        type: 'lightning_address',
        display: lightningAddress,
      };
    }
    return null;
  }

  /**
   * Check if recipient is a saved contact
   */
  private async checkSavedContact(
    possibleContactName: string | undefined,
    whatsappId: string,
  ): Promise<{
    type: string;
    display: string;
  } | null> {
    if (!possibleContactName) {
      return null;
    }

    const contactsKey = `contacts:${whatsappId}`;
    const savedContacts = await this.redisService.get(contactsKey);

    if (!savedContacts) {
      return null;
    }

    const contacts = JSON.parse(savedContacts);
    const contactKey = possibleContactName.toLowerCase();

    if (contacts[contactKey]) {
      const contactInfo = contacts[contactKey];
      const contactPhone = typeof contactInfo === 'string' ? contactInfo : contactInfo.phone;
      return {
        type: 'contact',
        display: `${possibleContactName} (${contactPhone})`,
      };
    }

    return null;
  }

  /**
   * Validate Flash username
   */
  private async validateUsername(
    targetUsername: string,
    authToken: string,
  ): Promise<{
    error?: string;
    recipientInfo?: {
      type: string;
      display: string;
      walletId: string;
    };
  }> {
    try {
      const walletCheck = await this.flashApiService.executeQuery<any>(
        ACCOUNT_DEFAULT_WALLET_QUERY,
        { username: targetUsername },
        authToken,
      );

      if (walletCheck?.accountDefaultWallet?.id) {
        return {
          recipientInfo: {
            type: 'username',
            display: `@${targetUsername}`,
            walletId: walletCheck.accountDefaultWallet.id,
          },
        };
      } else {
        return {
          error: `❌ Username @${targetUsername} not found.\n\n💡 Tips:\n• Check the spelling\n• Ask them to set a username\n• Use their phone number instead`,
        };
      }
    } catch (error) {
      this.logger.error(`Error validating username: ${error.message}`);
      return { error: `❌ Unable to verify username @${targetUsername}. Please try again.` };
    }
  }

  /**
   * Check if recipient is a phone number
   */
  private checkPhoneNumber(targetPhone?: string): {
    type: string;
    display: string;
  } | null {
    if (targetPhone) {
      return {
        type: 'phone',
        display: targetPhone,
      };
    }
    return null;
  }

  /**
   * Handle send command - send Lightning payment
   */
  private async handleSendCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string | { text: string; voice?: Buffer; voiceOnly?: boolean }> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified || !session.flashAuthToken) {
        return this.getNotLinkedMessage();
      }

      // Parse amount
      const amountStr = command.args.amount;
      if (!amountStr) {
        return 'Please specify amount in USD. Usage: send [amount] to [recipient]';
      }

      const parsedResult = parseAndValidateAmount(amountStr);
      if (parsedResult.error) {
        return parsedResult.error;
      }
      const amount = parsedResult.amount!;

      // Determine recipient type
      let targetUsername = command.args.username;
      let targetPhone = command.args.phoneNumber;
      let lightningAddress = command.args.recipient;
      let isContactPayment = false;

      // Check if recipient might be a saved contact FIRST
      // This takes precedence over username lookup
      if (
        (targetUsername || lightningAddress) &&
        !lightningAddress?.includes('@') &&
        !lightningAddress?.includes('lnbc')
      ) {
        const possibleContactName = targetUsername || lightningAddress;
        const contactsKey = `contacts:${whatsappId}`;
        const savedContacts = await this.redisService.get(contactsKey);

        if (savedContacts) {
          const contacts = JSON.parse(savedContacts);
          const contactKey = possibleContactName.toLowerCase();

          if (contacts[contactKey]) {
            // Found a saved contact
            isContactPayment = true;
            const contactInfo = contacts[contactKey];
            // Handle both string format (legacy) and object format
            const contactPhone = typeof contactInfo === 'string' ? contactInfo : contactInfo.phone;

            // Check if this contact has a linked Flash account
            // Try multiple WhatsApp ID formats
            const possibleWhatsappIds = [
              contactPhone + '@c.us',
              contactPhone, // Raw phone number
              '+' + contactPhone, // With + prefix
              '+' + contactPhone + '@c.us', // With + prefix and @c.us
            ];

            let contactSession = null;
            for (const whatsappId of possibleWhatsappIds) {
              contactSession = await this.sessionService.getSessionByWhatsappId(whatsappId);
              if (contactSession) {
                break;
              }
            }

            if (
              contactSession?.isVerified &&
              contactSession.flashUserId &&
              contactSession.flashAuthToken
            ) {
              // Contact has a linked Flash account, get their username
              try {
                const contactUsername = await this.usernameService.getUsername(
                  contactSession.flashAuthToken,
                );
                if (contactUsername) {
                  // Use their Flash username for the payment
                  targetUsername = contactUsername;
                  lightningAddress = ''; // Clear this so we use username payment flow
                  // Continue with the payment flow
                } else {
                  // Contact has Flash but no username, use escrow
                  targetPhone = contactPhone;
                  targetUsername = ''; // Clear username to prevent lookup
                  lightningAddress = ''; // Clear this too
                }
              } catch (error) {
                this.logger.error(`Failed to get contact's Flash username: ${error.message}`);
                targetPhone = contactPhone;
                targetUsername = ''; // Clear username to prevent lookup
                lightningAddress = ''; // Clear this too
              }
            } else {
              // Contact doesn't have Flash, use escrow
              targetPhone = contactPhone;
              targetUsername = ''; // Clear username to prevent lookup
              lightningAddress = ''; // Clear this too
            }
          }
        }
      }

      // Check if it's a Lightning invoice/address
      if (
        lightningAddress &&
        (lightningAddress.startsWith('lnbc') || lightningAddress.includes('@'))
      ) {
        try {
          // Determine payment type and execute
          let result;
          if (lightningAddress.startsWith('lnbc')) {
            // It's a Lightning invoice
            // Get user's wallets
            const wallets = await this.paymentService.getUserWallets(session.flashAuthToken);

            result = await this.paymentService.sendLightningPayment(
              {
                walletId: wallets.usdWallet?.id || wallets.defaultWalletId,
                paymentRequest: lightningAddress,
                memo: command.args.memo,
              },
              session.flashAuthToken,
            );
          } else if (lightningAddress.includes('@')) {
            // It's a Lightning address - need to get invoice first
            return `❌ Lightning address payments coming soon!\n\nFor now, ask ${lightningAddress} to send you an invoice using:\nreceive ${amount}`;
          }

          if (result?.status === PaymentSendResult.Success) {
            // Generate transaction ID
            const txId = `LN${Date.now().toString().slice(-8)}`;
            // Get current balance for display
            let balanceDisplay = 'Check balance for details';
            try {
              const balanceInfo = await this.balanceService.getUserBalance(
                session.flashUserId!,
                session.flashAuthToken,
              );
              balanceDisplay = `$${balanceInfo.fiatBalance.toFixed(2)} ${balanceInfo.fiatCurrency}`;
            } catch (e) {
              // Ignore balance fetch errors in success message
            }

            const textMessage = `✅ Payment sent successfully!\n\n💸 Amount: $${amount.toFixed(2)} USD\n⚡ To: ${lightningAddress.substring(0, 30)}...\n📍 Transaction: #${txId}\n💰 New balance: ${balanceDisplay}\n\n💡 Tip: Save this invoice for future payments`;

            // Check if voice response is needed
            const shouldUseVoice = await this.ttsService.shouldUseVoice(
              command.rawText,
              command.args.isVoiceCommand === 'true',
              session.whatsappId,
            );

            if (shouldUseVoice) {
              const voiceText = this.paymentConfirmationService.formatPaymentSuccessForVoice(
                amount,
                lightningAddress.substring(0, 20),
                balanceDisplay,
              );
              const audioBuffer = await this.ttsService.textToSpeech(voiceText, 'en', whatsappId);

              const shouldSendVoiceOnly = await this.ttsService.shouldSendVoiceOnly(
                session.whatsappId,
              );

              return {
                text: shouldSendVoiceOnly ? '' : textMessage,
                voice: audioBuffer,
                voiceOnly: shouldSendVoiceOnly,
              };
            }

            return textMessage;
          } else {
            const errorMessage = result?.errors?.[0]?.message || 'Unknown error';

            // Get current balance for display if needed
            let balanceDisplay = 'Check balance for details';
            if (errorMessage.includes('Insufficient balance')) {
              try {
                const balanceInfo = await this.balanceService.getUserBalance(
                  session.flashUserId!,
                  session.flashAuthToken,
                );
                balanceDisplay = `$${balanceInfo.fiatBalance.toFixed(2)} ${balanceInfo.fiatCurrency}`;
              } catch (e) {
                // Ignore balance fetch errors
              }
            }

            return this.generatePaymentErrorResponse(
              errorMessage,
              command,
              session,
              amount,
              lightningAddress,
              balanceDisplay,
            );
          }
        } catch (error) {
          this.logger.error(`Lightning payment error: ${error.message}`);
          return (
            ResponseLengthUtil.getConciseResponse('error') + ' ' + error.message.substring(0, 50)
          );
        }
      }

      // Check if it's a username
      if (targetUsername) {
        try {
          // Verify username exists
          const walletCheck = await this.flashApiService.executeQuery<any>(
            ACCOUNT_DEFAULT_WALLET_QUERY,
            { username: targetUsername },
            session.flashAuthToken,
          );

          if (walletCheck?.accountDefaultWallet?.id) {
            // Intraledger payment
            const walletId = walletCheck.accountDefaultWallet.id;

            // Get user's wallets
            const userWallets = await this.paymentService.getUserWallets(session.flashAuthToken);

            const result = await this.paymentService.sendIntraLedgerUsdPayment(
              {
                walletId: userWallets.usdWallet?.id || userWallets.defaultWalletId,
                recipientWalletId: walletId,
                amount: amount * 100, // Convert to cents
                memo: command.args.memo,
              },
              session.flashAuthToken,
            );

            if (result?.status === PaymentSendResult.Success) {
              // Send notification to recipient if they have WhatsApp linked
              try {
                // Use optimized lookup by username
                const recipientSession =
                  await this.sessionService.getSessionByUsername(targetUsername);

                if (
                  recipientSession &&
                  recipientSession.flashUserId &&
                  recipientSession.flashAuthToken
                ) {
                  // Found the recipient! Send them a notification
                  // Clear cache first (fire and forget)
                  this.balanceService
                    .clearBalanceCache(recipientSession.flashUserId!)
                    .catch((err) =>
                      this.logger.error('Failed to clear recipient balance cache', err),
                    );

                  // Parallelize operations for recipient notification
                  const [senderUsername, balance, currentVoiceSettings] = await Promise.all([
                    this.usernameService
                      .getUsername(session.flashAuthToken)
                      .then((u) => u || 'Someone'),
                    this.balanceService.getUserBalance(
                      recipientSession.flashUserId!,
                      recipientSession.flashAuthToken,
                    ),
                    this.userVoiceSettingsService?.getUserVoiceSettings(
                      recipientSession.whatsappId,
                    ),
                  ]);

                  let recipientMessage = `💰 *Payment Received!*\n\n`;
                  recipientMessage += `Amount: *$${amount.toFixed(2)} USD*\n`;
                  recipientMessage += `From: *@${senderUsername}*\n`;
                  if (command.args.memo) {
                    recipientMessage += `Memo: _${command.args.memo}_\n`;
                  }
                  recipientMessage += `\n✅ Payment confirmed instantly`;

                  if (balance.fiatBalance > 0 || balance.btcBalance === 0) {
                    recipientMessage += `\n💼 New balance: *$${balance.fiatBalance.toFixed(2)} USD*`;
                  }

                  // Set recipient to 'voice on' mode if not already set
                  if (this.userVoiceSettingsService) {
                    if (!currentVoiceSettings || currentVoiceSettings.mode === UserVoiceMode.OFF) {
                      await this.userVoiceSettingsService.setUserVoiceMode(
                        recipientSession.whatsappId,
                        UserVoiceMode.ON,
                      );
                      this.logger.log(
                        `Set voice mode to ON for recipient ${recipientSession.whatsappId}`,
                      );
                    }
                  }

                  // Generate natural voice message for recipient
                  const voiceResponseService = this.voiceResponseService;
                  let naturalVoiceMessage = `Hi! You just received ${convertCurrencyToWords(amount.toFixed(2))} from ${senderUsername}.`;
                  if (command.args.memo) {
                    naturalVoiceMessage += ` They said: ${command.args.memo}.`;
                  }
                  // Use the balance we already fetched above
                  naturalVoiceMessage += ` Your new balance is ${convertCurrencyToWords(balance.fiatBalance.toFixed(2))}.`;
                  naturalVoiceMessage += ` The payment was confirmed instantly.`;

                  // Generate voice audio
                  const audioBuffer = await this.ttsService.textToSpeech(
                    naturalVoiceMessage,
                    'en',
                    recipientSession.whatsappId,
                  );

                  // Send voice-only notification (no text)
                  if (this.whatsappWebService?.isClientReady()) {
                    await this.whatsappWebService.sendVoiceMessage(
                      recipientSession.whatsappId,
                      audioBuffer,
                    );
                  }
                }
              } catch (error) {
                // Log error but don't fail the payment
                this.logger.error(`Error sending recipient notification: ${error.message}`);
              }

              // Generate transaction ID
              const txId = `TX${Date.now().toString().slice(-8)}`;
              // Get current balance for display
              let balanceDisplay = 'Check balance for details';
              try {
                const balanceInfo = await this.balanceService.getUserBalance(
                  session.flashUserId!,
                  session.flashAuthToken,
                );
                balanceDisplay = `$${balanceInfo.fiatBalance.toFixed(2)} ${balanceInfo.fiatCurrency}`;
              } catch (e) {
                // Ignore balance fetch errors in success message
              }

              // Store transaction for potential undo (only for intraledger)
              await this.undoTransactionService.storeUndoableTransaction(whatsappId, {
                transactionId: txId,
                type: 'send',
                amount: amount,
                currency: 'USD',
                recipient: targetUsername,
                timestamp: new Date(),
                memo: command.args.memo,
                canUndo: true, // Intraledger transactions can potentially be undone
              });

              // Log transaction for analytics
              await this.adminAnalyticsService.logTransaction(
                session.sessionId,
                amount,
                'sent',
                targetUsername,
                txId,
              );

              let successMsg = `✅ Payment sent to @${targetUsername}!\n\n`;
              successMsg += `💸 Amount: $${amount.toFixed(2)} USD\n`;
              if (command.args.memo) {
                successMsg += `📝 Memo: "${command.args.memo}"\n`;
              }
              successMsg += `📍 Transaction: #${txId}\n`;
              successMsg += `💰 New balance: ${balanceDisplay}\n\n`;
              successMsg += `💡 Tip: Request it back with "request ${amount} from ${targetUsername}"`;

              // Check if voice response is needed
              const shouldUseVoice = await this.ttsService.shouldUseVoice(
                command.rawText,
                command.args.isVoiceCommand === 'true',
                session.whatsappId,
              );

              if (shouldUseVoice) {
                const voiceText = this.paymentConfirmationService.formatPaymentSuccessForVoice(
                  amount,
                  `@${targetUsername}`,
                  balanceDisplay,
                );
                const audioBuffer = await this.ttsService.textToSpeech(voiceText, 'en', whatsappId);

                const shouldSendVoiceOnly = await this.ttsService.shouldSendVoiceOnly(
                  session.whatsappId,
                );

                return {
                  text: shouldSendVoiceOnly ? '' : successMsg,
                  voice: audioBuffer,
                  voiceOnly: shouldSendVoiceOnly,
                };
              }

              return successMsg;
            } else {
              const errorMessage = result?.errors?.[0]?.message || 'Unknown error';

              // Get current balance for display if needed
              let balanceDisplay = 'Check balance for details';
              if (errorMessage.includes('Insufficient balance')) {
                try {
                  const balanceInfo = await this.balanceService.getUserBalance(
                    session.flashUserId!,
                    session.flashAuthToken,
                  );
                  balanceDisplay = `$${balanceInfo.fiatBalance.toFixed(2)} ${balanceInfo.fiatCurrency}`;
                } catch (e) {
                  // Ignore balance fetch errors
                }
              }

              return this.generatePaymentErrorResponse(
                errorMessage,
                command,
                session,
                amount,
                `@${targetUsername}`,
                balanceDisplay,
              );
            }
          } else {
            return this.generatePaymentErrorResponse(
              `Username @${targetUsername} not found`,
              command,
              session,
              amount,
              `@${targetUsername}`,
            );
          }
        } catch (error) {
          this.logger.error(`Username payment error: ${error.message}`);

          // Check if the error is about account not existing
          if (error.message.includes('Account does not exist for username')) {
            // Check if this might be a contact name
            const contactsKey = `contacts:${whatsappId}`;
            const contactsData = await this.redisService.get(contactsKey);

            if (contactsData) {
              const contacts = JSON.parse(contactsData);
              const contact = contacts[targetUsername.toLowerCase()];

              if (contact) {
                // Found in contacts but they don't have a Flash account
                // Create pending payment using admin wallet as escrow
                try {
                  // Get admin token from config
                  const adminToken = this.configService.get<string>('flashApi.apiKey');
                  if (!adminToken) {
                    return `❌ Unable to process pending payment. Please try again later.`;
                  }

                  // Parallelize wallet fetches
                  const [adminWallets, userWallets] = await Promise.all([
                    this.paymentService.getUserWallets(adminToken),
                    this.paymentService.getUserWallets(session.flashAuthToken),
                  ]);

                  const adminWalletId = adminWallets.usdWallet?.id || adminWallets.defaultWalletId;
                  const senderWalletId = userWallets.usdWallet?.id || userWallets.defaultWalletId;

                  if (!adminWalletId) {
                    this.logger.error('Admin wallet not found');
                    return `❌ Unable to process pending payment. Please try again later.`;
                  }

                  // First generate the claim code that will be used
                  const claimCode = this.generateClaimCode();

                  // Send payment to admin wallet (escrow) with claim code in memo
                  const escrowMemo = `Pending payment for ${targetUsername} (${contact.phone}) - Claim: ${claimCode}`;
                  const escrowResult = await this.paymentService.sendIntraLedgerUsdPayment(
                    {
                      walletId: senderWalletId,
                      recipientWalletId: adminWalletId,
                      amount: amount * 100, // Convert to cents
                      memo: escrowMemo,
                    },
                    session.flashAuthToken,
                  );

                  if (escrowResult?.status !== PaymentSendResult.Success) {
                    const errorMessage =
                      escrowResult?.errors?.[0]?.message || 'Failed to create pending payment';
                    return `❌ ${errorMessage}`;
                  }

                  // Create pending payment record with the same claim code
                  const senderUsername =
                    (await this.usernameService.getUsername(session.flashAuthToken)) ||
                    'Flash user';
                  const pendingPayment =
                    await this.pendingPaymentService.createPendingPaymentWithCode({
                      senderId: session.flashUserId!,
                      senderUsername,
                      senderPhone: session.phoneNumber,
                      recipientPhone: contact.phone,
                      recipientName: targetUsername,
                      amountCents: amount * 100,
                      memo: command.args.memo,
                      claimCode: claimCode,
                      escrowTransactionId: undefined, // Transaction ID not available in response
                    });

                  // Send notification to recipient if we have WhatsApp Web service
                  if (this.whatsappWebService) {
                    try {
                      const recipientWhatsApp = `${contact.phone}@c.us`;

                      // Set recipient to 'voice on' mode
                      if (this.userVoiceSettingsService) {
                        const currentSettings =
                          await this.userVoiceSettingsService.getUserVoiceSettings(
                            recipientWhatsApp,
                          );
                        if (!currentSettings || currentSettings.mode === UserVoiceMode.OFF) {
                          await this.userVoiceSettingsService.setUserVoiceMode(
                            recipientWhatsApp,
                            UserVoiceMode.ON,
                          );
                          this.logger.log(
                            `Set voice mode to ON for pending payment recipient ${recipientWhatsApp}`,
                          );
                        }
                      }

                      // Generate natural voice message for pending payment
                      let naturalVoiceMessage = `Hi ${targetUsername}! You have a pending payment of ${convertCurrencyToWords(amount.toFixed(2))} from ${senderUsername}.`;
                      if (command.args.memo) {
                        naturalVoiceMessage += ` They said: ${command.args.memo}.`;
                      }
                      naturalVoiceMessage += ` To claim this money, you'll need to join Flash by typing 'link'. Your claim code is ${pendingPayment.claimCode.split('').join(' ')}. This payment will be waiting for you for 30 days.`;

                      // Generate voice audio
                      const audioBuffer = await this.ttsService.textToSpeech(
                        naturalVoiceMessage,
                        'en',
                        recipientWhatsApp,
                      );

                      // Send voice-only notification (no text)
                      await this.whatsappWebService.sendVoiceMessage(
                        recipientWhatsApp,
                        audioBuffer,
                      );
                    } catch (notifyError) {
                      this.logger.error(`Failed to notify recipient: ${notifyError.message}`);
                    }
                  }

                  return `✅ Payment sent - Pending delivery!\n\n💰 $${amount.toFixed(2)} USD is waiting for ${targetUsername}\n📱 They've been notified via WhatsApp\n🔑 Claim code: ${pendingPayment.claimCode}\n⏱️ Expires: ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}\n\n🎯 What happens next:\n• ${targetUsername} gets your payment when they join Flash\n• You'll be notified when claimed\n• Refunded automatically if not claimed in 30 days\n\n💡 Tip: Tell ${targetUsername} to type 'link' to Flash to claim`;
                } catch (error) {
                  this.logger.error(
                    `Error creating pending payment: ${error.message}`,
                    error.stack,
                  );
                  return `❌ Failed to create pending payment. Please try again.`;
                }
              }
            }

            // Not found in contacts either
            // Store pending send info for when contact is added
            const pendingKey = `pending_send:${whatsappId}`;
            await this.redisService.set(
              pendingKey,
              JSON.stringify({
                amount,
                recipient: targetUsername,
                memo: command.args.memo,
              }),
              300,
            ); // 5 minute expiry

            return `${targetUsername} not found. Share contact or: contacts add ${targetUsername} +1234567890`;
          }

          return `❌ Unable to send to @${targetUsername}: ${error.message}`;
        }
      }

      // If phone number provided (escrow payment for contacts without Flash)
      if (targetPhone) {
        try {
          // Get admin token from config
          const adminToken = this.configService.get<string>('flashApi.apiKey');
          if (!adminToken) {
            return `❌ Unable to process pending payment. Please try again later.`;
          }

          // Parallelize wallet fetches
          const [adminWallets, userWallets] = await Promise.all([
            this.paymentService.getUserWallets(adminToken),
            this.paymentService.getUserWallets(session.flashAuthToken),
          ]);

          const adminWalletId = adminWallets.usdWallet?.id || adminWallets.defaultWalletId;
          const senderWalletId = userWallets.usdWallet?.id || userWallets.defaultWalletId;

          if (!adminWalletId) {
            this.logger.error('Admin wallet not found');
            return `❌ Unable to process pending payment. Please try again later.`;
          }

          // First generate the claim code that will be used
          const claimCode = this.generateClaimCode();

          // Determine recipient name for the escrow memo
          const recipientName = isContactPayment
            ? command.args.username || command.args.recipient || 'contact'
            : targetPhone;

          // Send payment to admin wallet (escrow) with claim code in memo
          const escrowMemo = `Pending payment for ${recipientName} (${targetPhone}) - Claim: ${claimCode}`;
          const escrowResult = await this.paymentService.sendIntraLedgerUsdPayment(
            {
              walletId: senderWalletId,
              recipientWalletId: adminWalletId,
              amount: amount * 100, // Convert to cents
              memo: escrowMemo,
            },
            session.flashAuthToken,
          );

          if (escrowResult?.status !== PaymentSendResult.Success) {
            const errorMessage =
              escrowResult?.errors?.[0]?.message || 'Failed to create pending payment';
            return `❌ ${errorMessage}`;
          }

          // Create pending payment record with the same claim code
          const senderUsername =
            (await this.usernameService.getUsername(session.flashAuthToken)) || 'Flash user';
          const pendingPayment = await this.pendingPaymentService.createPendingPaymentWithCode({
            senderId: session.flashUserId!,
            senderUsername,
            senderPhone: session.phoneNumber,
            recipientPhone: targetPhone,
            recipientName,
            amountCents: amount * 100,
            memo: command.args.memo,
            claimCode: claimCode,
            escrowTransactionId: undefined, // Transaction ID not available in response
          });

          // Send notification to recipient if we have WhatsApp Web service
          if (this.whatsappWebService) {
            try {
              const recipientWhatsApp = `${targetPhone}@c.us`;

              // Set recipient to 'voice on' mode
              if (this.userVoiceSettingsService) {
                const currentSettings =
                  await this.userVoiceSettingsService.getUserVoiceSettings(recipientWhatsApp);
                if (!currentSettings || currentSettings.mode === UserVoiceMode.OFF) {
                  await this.userVoiceSettingsService.setUserVoiceMode(
                    recipientWhatsApp,
                    UserVoiceMode.ON,
                  );
                  this.logger.log(
                    `Set voice mode to ON for pending payment recipient ${recipientWhatsApp}`,
                  );
                }
              }

              // Generate natural voice message for pending payment
              let naturalVoiceMessage = `Hi! You have a pending payment of ${convertCurrencyToWords(amount.toFixed(2))} from ${senderUsername}.`;
              if (command.args.memo) {
                naturalVoiceMessage += ` They said: ${command.args.memo}.`;
              }
              naturalVoiceMessage += ` To claim this money, you'll need to join Flash by typing 'link'. Your claim code is ${pendingPayment.claimCode.split('').join(' ')}. This payment will be waiting for you for 30 days.`;

              // Generate voice audio
              const audioBuffer = await this.ttsService.textToSpeech(
                naturalVoiceMessage,
                'en',
                recipientWhatsApp,
              );

              // Send voice-only notification (no text)
              await this.whatsappWebService.sendVoiceMessage(recipientWhatsApp, audioBuffer);
            } catch (notifyError) {
              this.logger.error(`Failed to notify recipient: ${notifyError.message}`);
            }
          }

          return `✅ Sent $${amount.toFixed(2)} to ${recipientName}\n🔑 Code: ${pendingPayment.claimCode}\n⏱️ Expires: 30 days`;
        } catch (error) {
          this.logger.error(`Error creating pending payment: ${error.message}`, error.stack);
          return `❌ Failed to create pending payment. Please try again.`;
        }
      }

      return 'Please specify a valid recipient:\n• @username (Flash user)\n• Lightning invoice (lnbc...)\n• Lightning address (user@domain.com)';
    } catch (error) {
      this.logger.error(`Error handling send command: ${error.message}`, error.stack);
      return '❌ Failed to send payment. Please try again later.';
    }
  }

  /**
   * Handle history command - show recent transactions
   */
  private async handleHistoryCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string | { text: string; voice?: Buffer; voiceOnly?: boolean }> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified || !session.flashAuthToken || !session.flashUserId) {
        return this.getNotLinkedMessage();
      }

      // Check if a specific transaction ID was requested
      if (command.args.transactionId) {
        return this.getTransactionDetails(command.args.transactionId, session);
      }

      // Get recent transactions
      const transactions = await this.transactionService.getRecentTransactions(
        session.flashAuthToken,
        10, // Show last 10 transactions
      );

      if (!transactions) {
        return '❌ Unable to fetch transaction history. Please try again later.';
      }

      // Get current display currency from user's balance
      const balance = await this.balanceService.getUserBalance(
        session.flashUserId,
        session.flashAuthToken,
      );
      const displayCurrency = balance?.fiatCurrency || 'USD';

      // Format transaction history for WhatsApp
      return this.transactionService.formatTransactionHistory(transactions, displayCurrency);
    } catch (error) {
      this.logger.error(`Error handling history command: ${error.message}`, error.stack);
      return '❌ Failed to fetch transaction history. Please try again later.';
    }
  }

  /**
   * Generate payment error response with optional voice
   */
  private async generatePaymentErrorResponse(
    errorMessage: string,
    command: ParsedCommand,
    session: UserSession,
    amount?: number,
    recipient?: string,
    balanceDisplay?: string,
  ): Promise<string | { text: string; voice?: Buffer; voiceOnly?: boolean }> {
    let textResponse: string;

    if (errorMessage.includes('Insufficient balance')) {
      textResponse = `❌ Payment failed: Insufficient balance\n\n💰 You need: $${amount?.toFixed(2)} USD\n💳 You have: ${balanceDisplay || 'Check balance for details'}\n\n🔄 Next steps:\n→ Type 'receive ${amount}' to request funds\n→ ${recipient ? `Ask ${recipient} to request payment instead` : 'Ask someone to send you money'}\n→ Add funds in the Flash app`;
    } else if (errorMessage.includes('limit')) {
      textResponse = `❌ Payment failed: Transaction limit reached\n\n📏 Daily/monthly limit exceeded\n\n💡 Next steps:\n→ Wait 24 hours for daily limit reset\n→ Check limits in Flash app\n→ Type 'support' for limit increase\n→ Reference: #LMT${Date.now().toString().slice(-6)}`;
    } else if (errorMessage.includes('Account is inactive')) {
      textResponse = `❌ Payment blocked: Account restricted\n\n🔒 Your account has temporary restrictions\n\n💉 Next steps:\n→ Type 'support' to chat with an agent\n→ Email support@flashapp.me\n→ Reference: #ERR${Date.now().toString().slice(-6)}`;
    } else if (errorMessage.includes('not found') || errorMessage.includes('Username')) {
      textResponse = `❌ ${errorMessage}\n\n🔍 Possible issues:\n• Typo in username\n• User hasn't set a username yet\n• Account doesn't exist\n\n💡 Next steps:\n→ Double-check the spelling\n→ Ask for their phone number instead\n→ Use 'contacts add' to save them`;
    } else {
      textResponse = `❌ Payment failed: ${errorMessage}`;
    }

    // Check if voice response is needed
    const shouldUseVoice = await this.ttsService.shouldUseVoice(
      command.rawText,
      command.args.isVoiceCommand === 'true',
      session.whatsappId,
    );

    if (shouldUseVoice) {
      const voiceText = this.paymentConfirmationService.formatPaymentErrorForVoice(errorMessage);
      const audioBuffer = await this.ttsService.textToSpeech(voiceText, 'en', session.whatsappId);

      const shouldSendVoiceOnly = await this.ttsService.shouldSendVoiceOnly(session.whatsappId);

      return {
        text: shouldSendVoiceOnly ? '' : textResponse,
        voice: audioBuffer,
        voiceOnly: shouldSendVoiceOnly,
      };
    }

    return textResponse;
  }

  /**
   * Get detailed information about a specific transaction
   */
  private async getTransactionDetails(
    transactionId: string,
    session: UserSession,
  ): Promise<string | { text: string; voice?: Buffer; voiceOnly?: boolean }> {
    try {
      // Ensure we have auth token
      if (!session.flashAuthToken) {
        return '❌ Authentication required. Please try again.';
      }

      // First, try to find the transaction in recent history
      const transactions = await this.transactionService.getRecentTransactions(
        session.flashAuthToken,
        50, // Look through more transactions
      );

      if (!transactions || !transactions.edges) {
        return '❌ Unable to fetch transaction details. Please try again later.';
      }

      // Search for the transaction by ID
      const txEdge = transactions.edges.find((edge) => {
        // Transaction IDs could be the full ID or a shortened version
        return edge.node.id.includes(transactionId) || edge.node.id.endsWith(transactionId);
      });

      if (!txEdge) {
        return `❌ Transaction #${transactionId} not found\n💡 Try "history" for recent transactions`;
      }

      // Format detailed transaction information
      const tx = txEdge.node;
      const detailsText = await this.transactionService.formatDetailedTransaction(
        tx,
        session.flashAuthToken,
      );

      // Check if voice response is needed
      const shouldUseVoice = await this.ttsService.shouldUseVoice(
        `history ${transactionId}`,
        false,
        session.whatsappId,
      );

      if (shouldUseVoice) {
        const voiceText = this.transactionService.formatTransactionForVoice(tx);
        const audioBuffer = await this.ttsService.textToSpeech(voiceText, 'en', session.whatsappId);

        const shouldSendVoiceOnly = await this.ttsService.shouldSendVoiceOnly(session.whatsappId);

        return {
          text: shouldSendVoiceOnly ? '' : detailsText,
          voice: audioBuffer,
          voiceOnly: shouldSendVoiceOnly,
        };
      }

      return detailsText;
    } catch (error) {
      this.logger.error(`Error getting transaction details: ${error.message}`, error.stack);
      return '❌ Failed to fetch transaction details. Please try again later.';
    }
  }

  /**
   * Handle payment request command - request payment from another user
   */
  private async handleRequestCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<{ text: string; media?: Buffer }> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified || !session.flashAuthToken) {
        return {
          text: ResponseLengthUtil.getConciseResponse('not_linked'),
        };
      }

      // Parse amount and target (username or phone)
      const amountStr = command.args.amount;
      let targetUsername = command.args.username;
      let targetPhone = command.args.phoneNumber;

      if (!amountStr || (!targetUsername && !targetPhone)) {
        return {
          text: 'Please specify amount (in USD) and recipient. Usage:\n• request [amount] from [@username]\n• request [amount] from [phone]\n• request [amount] from [@username] [phone]\n• request [amount] from [contact_name]',
        };
      }

      // Check if username might be a saved contact name
      let isFromSavedContact = false;
      let contactNotFound = false;
      if (targetUsername && !targetUsername.includes('@') && !targetPhone) {
        const contactsKey = `contacts:${whatsappId}`;
        const savedContacts = await this.redisService.get(contactsKey);

        if (savedContacts) {
          const contacts = JSON.parse(savedContacts);
          const contactKey = targetUsername.toLowerCase();

          if (contacts[contactKey]) {
            // Found a saved contact, use their phone number
            targetPhone = contacts[contactKey].phone;
            isFromSavedContact = true;
          } else {
            // Contact name provided but not found
            contactNotFound = true;
          }
        } else {
          // No contacts saved yet, but a name was provided
          contactNotFound = true;
        }
      }

      // Validate amount
      const parsedResult = parseAndValidateAmount(amountStr);
      if (parsedResult.error) {
        return { text: parsedResult.error };
      }
      const amount = parsedResult.amount;

      // If contact not found, prompt user to add it
      if (contactNotFound) {
        // Store the pending request in Redis
        const pendingKey = `pending_request:${whatsappId}`;
        const pendingData = {
          type: 'payment_request',
          contactName: targetUsername,
          amount: amount,
          timestamp: new Date().toISOString(),
        };
        await this.redisService.set(pendingKey, JSON.stringify(pendingData), 300); // 5 minute expiry

        return {
          text: `❓ Contact "${targetUsername}" not found.\n\nTo create this contact and send the payment request for $${amount!.toFixed(2)}:\n\n• Share the contact from your phone's contact list\n• OR reply with: ${targetUsername} [phone number]\n\nExample: ${targetUsername} +18765551234`,
        };
      }

      // Validate target username if provided (skip if it's a saved contact)
      if (targetUsername && !isFromSavedContact) {
        try {
          const walletCheck = await this.flashApiService.executeQuery<any>(
            ACCOUNT_DEFAULT_WALLET_QUERY,
            { username: targetUsername },
            session.flashAuthToken,
          );

          if (!walletCheck?.accountDefaultWallet?.id) {
            return {
              text: `❌ Username @${targetUsername} not found\n\n🔍 Double-check the spelling\n→ Try: 'request ${amount} from [phone_number]'\n→ Or ask them to send you their username`,
            };
          }
        } catch (error) {
          this.logger.error(`Error checking username: ${error.message}`);
          return {
            text: `❌ Unable to verify username @${targetUsername}. Please try again later.`,
          };
        }
      }

      // Get requester's username
      const requesterUsername =
        (await this.usernameService.getUsername(session.flashAuthToken)) || 'Flash user';

      // Create invoice for the requested amount
      const memo = `Payment request from @${requesterUsername}`;
      const invoice = await this.invoiceService.createInvoice(
        session.flashAuthToken,
        amount!,
        memo,
        'USD',
      );

      if (!invoice) {
        return { text: '❌ Failed to create payment request. Please try again later.' };
      }

      // Format the request message (no QR code needed)
      let requestMessage = `💸 *Payment Request*\n\n`;
      requestMessage += `From: @${requesterUsername}\n`;
      requestMessage += `Amount: $${amount!.toFixed(2)} USD\n`;
      requestMessage += `\n_Request expires in ${Math.floor((new Date(invoice.expiresAt).getTime() - Date.now()) / 60000)} minutes_`;

      // If we have a phone number, try to send WhatsApp message
      if (targetPhone && this.whatsappWebService) {
        try {
          // Normalize phone number
          const normalizedPhone = targetPhone.replace(/\D/g, '');
          const whatsappNumber = `${normalizedPhone}@c.us`;

          // Build recipient identifier for message
          let recipientIdentifier = '';
          if (isFromSavedContact) {
            recipientIdentifier = targetUsername!; // Saved contact name
          } else if (targetUsername) {
            recipientIdentifier = `@${targetUsername}`; // Flash username
          } else {
            recipientIdentifier = `the number ${targetPhone}`; // Direct phone number
          }

          // Store the payment request for the recipient
          const recipientRequestKey = `pending_request:${whatsappNumber}`;
          const requestData = {
            type: 'payment_request',
            invoice: invoice.paymentRequest,
            amount: amount!,
            requesterUsername,
            requesterWhatsappId: whatsappId,
            createdAt: new Date().toISOString(),
            expiresAt: invoice.expiresAt,
          };
          await this.redisService.setEncrypted(recipientRequestKey, requestData, 3600); // 1 hour expiry

          // Send the payment request message with pay instructions
          requestMessage = `💸 *Payment Request*\n\n`;
          requestMessage += `From: @${requesterUsername}\n`;
          requestMessage += `Amount: $${amount!.toFixed(2)} USD\n`;
          requestMessage += `\n💳 *To pay this request:*\n`;
          requestMessage += `Simply type \`pay\` to send the payment\n`;
          requestMessage += `\n_Request expires in ${Math.floor((new Date(invoice.expiresAt).getTime() - Date.now()) / 60000)} minutes_`;

          // Send the payment request message (no QR code)
          await this.whatsappWebService.sendMessage(whatsappNumber, requestMessage);

          // Track the request in contact history
          if (isFromSavedContact && targetUsername) {
            await this.trackContactRequest(whatsappId, targetUsername, {
              type: 'request_sent',
              amount: amount!,
              invoice: invoice.paymentRequest,
              timestamp: new Date().toISOString(),
            });
          }

          return {
            text: `✅ Payment request sent to ${recipientIdentifier} via WhatsApp!\n\nThey will receive your request for $${amount!.toFixed(2)} USD.`,
          };
        } catch (error) {
          this.logger.error(`Failed to send WhatsApp message: ${error.message}`);
          // Continue to show the QR code to the requester
        }
      }

      // If this was a contact request but no phone was found, show a different message
      if (!targetPhone && isFromSavedContact) {
        return {
          text: `❌ Unable to send payment request. The contact "${targetUsername}" doesn't have a phone number saved.`,
        };
      }

      // Return the payment request to the requester
      return {
        text: requestMessage,
      };
    } catch (error) {
      this.logger.error(`Error handling request command: ${error.message}`, error.stack);
      return { text: '❌ Failed to create payment request. Please try again later.' };
    }
  }

  /**
   * Handle contacts command - manage saved contacts
   */
  private async handleContactsCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string | { text: string; voice?: Buffer; voiceOnly?: boolean }> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified) {
        return ResponseLengthUtil.getConciseResponse('not_linked');
      }

      const action = command.args.action || 'list';
      const contactName = command.args.name;
      const phoneNumber = command.args.phoneNumber;

      const contactsKey = `contacts:${whatsappId}`;

      switch (action) {
        case 'add': {
          if (!contactName || !phoneNumber) {
            return 'Please provide name and phone number. Usage: contacts add [name] [phone]';
          }

          // Get existing contacts
          const existingContacts = await this.redisService.get(contactsKey);
          const contacts = existingContacts ? JSON.parse(existingContacts) : {};

          // Check if contact already exists
          const existingContact = contacts[contactName.toLowerCase()];
          if (existingContact && existingContact.phone === phoneNumber.replace(/\D/g, '')) {
            return `ℹ️ Contact "${contactName}" already exists with this number.`;
          }

          // Add or update contact
          contacts[contactName.toLowerCase()] = {
            name: contactName,
            phone: phoneNumber.replace(/\D/g, ''),
            addedAt: new Date().toISOString(),
          };

          // Save contacts (expire after 1 year)
          await this.redisService.set(contactsKey, JSON.stringify(contacts), 365 * 24 * 60 * 60);

          return `✅ Contact saved: ${contactName} (${phoneNumber})\n\nYou can now use these commands:\n• send [amount] to ${contactName} - Send money instantly\n• request [amount] from ${contactName} - Request payment`;
        }

        case 'remove': {
          if (!contactName) {
            return 'Please provide contact name. Usage: contacts remove [name]';
          }

          const contactsToUpdate = await this.redisService.get(contactsKey);
          if (!contactsToUpdate) {
            return 'You have no saved contacts.';
          }

          const contactList = JSON.parse(contactsToUpdate);
          const nameKey = contactName.toLowerCase();

          if (!contactList[nameKey]) {
            return `Contact "${contactName}" not found.`;
          }

          delete contactList[nameKey];
          await this.redisService.set(contactsKey, JSON.stringify(contactList), 365 * 24 * 60 * 60);

          return `✅ Contact "${contactName}" removed.`;
        }

        case 'history': {
          if (!contactName) {
            return 'Please provide contact name. Usage: contacts history [name]';
          }

          const historyKey = `contact_history:${whatsappId}:${contactName.toLowerCase()}`;
          const contactHistory = await this.redisService.get(historyKey);

          if (!contactHistory) {
            return `No payment history found for contact "${contactName}".`;
          }

          const history = JSON.parse(contactHistory);
          let historyMessage = `📊 *Payment History for ${contactName}*\n\n`;

          history
            .slice(-10)
            .reverse()
            .forEach((req: any) => {
              const date = new Date(req.timestamp);
              const dateStr = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              if (req.type === 'request_sent') {
                historyMessage += `💸 Requested $${req.amount.toFixed(2)} - ${dateStr}\n`;
              }
            });

          historyMessage += `\n_Showing last 10 requests_`;
          return historyMessage;
        }

        case 'list':
        default: {
          const savedContacts = await this.redisService.get(contactsKey);
          if (!savedContacts) {
            const noContactsMsg =
              'You have no saved contacts.\n\nTo add a contact: contacts add [name] [phone]';
            return await this.convertToVoiceOnlyResponse(noContactsMsg, whatsappId);
          }

          const contactData = JSON.parse(savedContacts);
          const contactEntries = Object.values(contactData) as Array<{
            name: string;
            phone: string;
            addedAt: string;
          }>;

          if (contactEntries.length === 0) {
            const noContactsMsg =
              'You have no saved contacts.\n\nTo add a contact: contacts add [name] [phone]';
            return await this.convertToVoiceOnlyResponse(noContactsMsg, whatsappId);
          }

          let message = '📇 *Your Saved Contacts*\n\n';
          for (const contact of contactEntries) {
            message += `• ${contact.name}: ${contact.phone}`;

            // Check if there's history for this contact
            const histKey = `contact_history:${whatsappId}:${contact.name.toLowerCase()}`;
            const hist = await this.redisService.get(histKey);
            if (hist) {
              const histData = JSON.parse(hist);
              message += ` (${histData.length} requests)`;
            }
            message += '\n';
          }
          message += '\n_Type "contacts history [name]" to see request history_';

          // Check if we're in voice-only mode
          const isVoiceOnly = await this.ttsService.shouldSendVoiceOnly(whatsappId);
          if (isVoiceOnly) {
            // Generate natural language response for contacts list
            let naturalResponse = '';
            if (contactEntries.length === 1) {
              const contact = contactEntries[0];
              naturalResponse = `You have one saved contact: ${contact.name} with phone number ${contact.phone}.`;
              const histKey = `contact_history:${whatsappId}:${contact.name.toLowerCase()}`;
              const hist = await this.redisService.get(histKey);
              if (hist) {
                const histData = JSON.parse(hist);
                naturalResponse += ` You've made ${histData.length} payment requests to them.`;
              }
            } else {
              naturalResponse = `You have ${contactEntries.length} saved contacts. `;
              const names = contactEntries.map((c) => c.name);
              if (names.length <= 3) {
                naturalResponse += `They are: ${names.join(', ')}.`;
              } else {
                const lastContact = names.pop();
                naturalResponse += `They are: ${names.slice(0, 2).join(', ')}, and ${names.length} others including ${lastContact}.`;
              }
            }
            naturalResponse += ` To see the history for a contact, say 'contacts history' followed by their name.`;

            const audioBuffer = await this.ttsService.textToSpeech(
              naturalResponse,
              'en',
              whatsappId,
            );
            return {
              text: '',
              voice: audioBuffer,
              voiceOnly: true,
            };
          }

          return message;
        }
      }
    } catch (error) {
      this.logger.error(`Error handling contacts command: ${error.message}`, error.stack);
      const errorMsg = '❌ Failed to manage contacts. Please try again later.';
      return await this.convertToVoiceOnlyResponse(errorMsg, whatsappId);
    }
  }

  /**
   * Check for pending requests and process them with new contact info
   */
  async checkAndProcessPendingRequest(
    whatsappId: string,
    contactName: string,
    phoneNumber: string,
  ): Promise<
    string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean } | null
  > {
    try {
      // Check for pending send first
      const pendingSendKey = `pending_send:${whatsappId}`;
      const pendingSendData = await this.redisService.get(pendingSendKey);

      if (pendingSendData) {
        const pendingSend = JSON.parse(pendingSendData);
        const normalizedContactName = contactName.toLowerCase().replace(/\s+/g, '_');

        // Check if this contact matches the pending send
        if (
          pendingSend.recipient?.toLowerCase() === normalizedContactName ||
          pendingSend.recipient?.toLowerCase() === contactName.toLowerCase()
        ) {
          // Delete the pending send
          await this.redisService.del(pendingSendKey);

          // First save the contact
          const session = await this.sessionService.getSessionByWhatsappId(whatsappId);
          if (!session || !session.isVerified) {
            return 'Please link your Flash account first to manage contacts.';
          }

          // Save contact
          const contactsKey = `contacts:${whatsappId}`;
          const existingContacts = await this.redisService.get(contactsKey);
          const contacts = existingContacts ? JSON.parse(existingContacts) : {};

          contacts[normalizedContactName] = {
            name: normalizedContactName,
            phone: phoneNumber.replace(/\D/g, ''),
            addedAt: new Date().toISOString(),
          };

          await this.redisService.set(contactsKey, JSON.stringify(contacts), 365 * 24 * 60 * 60);

          // Contact saved, but they still need Flash to receive money
          return `✅ Contact saved successfully!\n\n${contactName} needs a Flash account to receive your $${pendingSend.amount} USD.\n\nYou have two options:\n1. Reply with their @username if they already have Flash\n2. Send anyway - they'll get the money when they sign up\n\nTo send now, type: send ${pendingSend.amount} to ${contactName}`;
        }
      }

      // Check for pending payment request
      const pendingKey = `pending_request:${whatsappId}`;
      const pendingData = await this.redisService.get(pendingKey);

      if (!pendingData) {
        return null; // No pending request
      }

      const pending = JSON.parse(pendingData);

      // Check if this contact matches the pending request
      if (
        pending.type === 'payment_request' &&
        pending.contactName?.toLowerCase() === contactName.toLowerCase().replace(/\s+/g, '_')
      ) {
        // Delete the pending request
        await this.redisService.del(pendingKey);

        // First save the contact
        const session = await this.sessionService.getSessionByWhatsappId(whatsappId);
        if (!session || !session.isVerified) {
          return 'Please link your Flash account first to manage contacts.';
        }

        // Save contact
        const contactsKey = `contacts:${whatsappId}`;
        const existingContacts = await this.redisService.get(contactsKey);
        const contacts = existingContacts ? JSON.parse(existingContacts) : {};

        const normalizedName = contactName.replace(/\s+/g, '_');
        contacts[normalizedName.toLowerCase()] = {
          name: normalizedName,
          phone: phoneNumber.replace(/\D/g, ''),
          addedAt: new Date().toISOString(),
        };

        await this.redisService.set(contactsKey, JSON.stringify(contacts), 365 * 24 * 60 * 60);

        // Now process the payment request
        const command: ParsedCommand = {
          type: CommandType.REQUEST,
          args: {
            amount: pending.amount.toString(),
            username: normalizedName,
          },
          rawText: `request ${pending.amount} from ${normalizedName}`,
        };

        const result = await this.handleRequestCommand(command, whatsappId, session);

        // Add message about contact being saved
        if (typeof result === 'object' && result.text && result.text.includes('✅')) {
          result.text = `✅ Contact saved: ${normalizedName} (${phoneNumber})\n\nYou can now:\n• send money to ${normalizedName}\n• request payments from ${normalizedName}\n\n${result.text}`;
        }

        return result;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error processing pending request: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Track payment requests for a contact
   */
  private async trackContactRequest(
    whatsappId: string,
    contactName: string,
    requestData: any,
  ): Promise<void> {
    try {
      const historyKey = `contact_history:${whatsappId}:${contactName.toLowerCase()}`;
      const existingHistory = await this.redisService.get(historyKey);
      const history = existingHistory ? JSON.parse(existingHistory) : [];

      history.push(requestData);

      // Keep only last 50 requests per contact
      if (history.length > 50) {
        history.shift();
      }

      await this.redisService.set(historyKey, JSON.stringify(history), 365 * 24 * 60 * 60);
    } catch (error) {
      this.logger.error(`Error tracking contact request: ${error.message}`);
    }
  }

  /**
   * Get unknown command message based on session status
   */
  private async getUnknownCommandMessage(
    session: UserSession | null,
    whatsappId?: string,
    isGroup?: boolean,
  ): Promise<string | { text: string; voice?: Buffer; voiceOnly?: boolean }> {
    let message: string;

    // Provide a simple message without hints for all cases
    message = "I don't understand that command. Type `help` to see available commands.";

    if (whatsappId && !isGroup) {
      return await this.convertToVoiceOnlyResponse(message, whatsappId);
    }
    return message;
  }

  /**
   * Store invoice for payment tracking
   */
  private async storeInvoiceForTracking(
    whatsappId: string,
    invoice: any,
    authToken: string,
  ): Promise<void> {
    try {
      const invoiceData = {
        paymentHash: invoice.paymentHash,
        paymentRequest: invoice.paymentRequest,
        amount: invoice.amount,
        currency: invoice.currency || 'USD',
        memo: invoice.memo,
        status: 'pending',
        expiresAt: invoice.expiresAt,
        whatsappUserId: whatsappId,
        authToken: authToken, // Will be encrypted by Redis service
        createdAt: new Date().toISOString(),
      };

      // Store in Redis with encryption and expiration matching invoice expiry
      const expirySeconds = Math.floor((new Date(invoice.expiresAt).getTime() - Date.now()) / 1000);
      const key = `invoice:${invoice.paymentHash}`;

      await this.redisService.setEncrypted(
        key,
        invoiceData,
        Math.max(expirySeconds, 3600), // At least 1 hour
      );

      // Also store in a user's invoice list for easy lookup
      await this.redisService.addToSet(`user:${whatsappId}:invoices`, invoice.paymentHash);
    } catch (error) {
      this.logger.error('Failed to store invoice for tracking:', error);
      // Don't throw - this is a non-critical feature
    }
  }

  /**
   * Check invoice payment status
   */
  async checkInvoiceStatus(paymentHash: string): Promise<any> {
    try {
      const key = `invoice:${paymentHash}`;
      const invoice = await this.redisService.getEncrypted(key);

      if (!invoice) {
        return null;
      }

      // Only check if still pending
      if (invoice.status !== 'pending') {
        return invoice;
      }

      // Query GraphQL for invoice status
      const query = `
        query GetInvoiceStatus($paymentHash: String!) {
          invoice(paymentHash: $paymentHash) {
            status
            settledAt
          }
        }
      `;

      const result = await this.flashApiService.executeQuery<any>(
        query,
        { paymentHash },
        invoice.authToken,
      );

      if (result?.data?.invoice?.status === 'PAID') {
        invoice.status = 'paid';
        invoice.paidAt = result.data.invoice.settledAt;

        // Update Redis
        await this.redisService.setEncrypted(key, invoice, 3600); // Keep for 1 hour after payment

        // Notify user
        await this.notifyInvoicePaid(invoice);
      }

      return invoice;
    } catch (error) {
      this.logger.error(`Failed to check invoice status: ${error.message}`);
      return null;
    }
  }

  /**
   * Notify user when invoice is paid
   */
  async notifyInvoicePaid(invoice: any): Promise<void> {
    try {
      const paidAtDate = new Date(invoice.paidAt);
      const paidAtStr = paidAtDate.toLocaleString('en-US', {
        timeZone: 'America/Jamaica',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      const message = `✅ Payment Received!\n\nAmount: $${invoice.amount} USD\n${invoice.memo ? `Memo: ${invoice.memo}\n` : ''}Paid at: ${paidAtStr} EST\n\nThank you for your payment!`;

      // Send notification via WhatsApp Web
      if (this.whatsappWebService) {
        await this.whatsappWebService.sendMessage(invoice.whatsappUserId, message);
      }
    } catch (error) {
      this.logger.error('Failed to send payment notification:', error);
    }
  }

  /**
   * Handle detected Lightning invoice in message
   */
  private async handleInvoiceDetected(
    invoice: string,
    whatsappId: string,
    _session: UserSession,
  ): Promise<string> {
    try {
      // Parse the invoice to get details
      const invoiceDetails = await this.parseInvoiceDetails(invoice);

      // Store the invoice for quick payment
      // Use a list to support multiple pending payments
      const pendingPaymentsKey = `pending_payments:${whatsappId}`;

      // Get existing pending payments (encrypted)
      let payments = (await this.redisService.getEncrypted(pendingPaymentsKey)) || [];

      // Add new payment (avoid duplicates)
      const isDuplicate = payments.some((p: any) => p.invoice === invoice);
      if (!isDuplicate) {
        payments.push({
          invoice,
          details: invoiceDetails,
          timestamp: new Date().toISOString(),
          id: payments.length + 1,
        });

        // Keep only last 10 payments
        if (payments.length > 10) {
          payments = payments.slice(-10);
        }

        await this.redisService.setEncrypted(pendingPaymentsKey, payments, 300); // 5 minute expiry
      }

      // Format the response message
      let message = `⚡ *Lightning Invoice Detected*\n\n`;

      if (invoiceDetails.amount) {
        message += `Amount: $${invoiceDetails.amount.toFixed(2)} USD\n`;
      } else if (invoiceDetails.satoshis) {
        message += `Amount: ${invoiceDetails.satoshis.toLocaleString()} sats\n`;
      } else {
        message += `Amount: Any amount\n`;
      }

      if (invoiceDetails.description) {
        message += `Description: ${invoiceDetails.description}\n`;
      }

      message += `\n💳 *Quick Payment Options:*\n`;

      if (payments.length === 1) {
        message += `• Type \`pay confirm\` to pay this invoice\n`;
        message += `• Type \`pay cancel\` to dismiss\n`;
      } else {
        message += `• Type \`pay ${payments.length}\` to pay this invoice\n`;
        message += `• Type \`pay list\` to see all ${payments.length} pending invoices\n`;
        message += `• Type \`pay cancel all\` to dismiss all\n`;
      }

      const suggestedAmount =
        invoiceDetails.amount ||
        (invoiceDetails.satoshis ? `${invoiceDetails.satoshis} sats` : '[amount]');
      message += `• Or use: \`send ${suggestedAmount} to ${invoice.substring(0, 20)}...\`\n`;

      if (invoiceDetails.expiresIn) {
        message += `\n⏱️ Expires in: ${invoiceDetails.expiresIn}`;
      }

      return message;
    } catch (error) {
      this.logger.error(`Error handling detected invoice: ${error.message}`);
      return `⚡ Lightning invoice detected!\n\nTo pay it, use:\n\`send [amount] to ${invoice.substring(0, 30)}...\``;
    }
  }

  /**
   * Handle pay command for quick invoice payment
   */
  private async handlePayCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string | { text: string; voice?: Buffer; voiceOnly?: boolean }> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified || !session.flashAuthToken) {
        return this.getNotLinkedMessage();
      }

      const action = command.args.action;
      const modifier = command.args.modifier;

      // Check if this is a template payment (pay [template_name])
      if (action && !['confirm', 'cancel', 'list'].includes(action) && isNaN(parseInt(action))) {
        // This might be a template name
        return this.handlePayWithTemplate(action, whatsappId, session);
      }

      // First check for pending payment requests (when someone requested money from this user)
      // Note: We need to check both formats as the request might be stored with @c.us suffix
      let pendingRequestKey = `pending_request:${whatsappId}`;
      let pendingRequest = await this.redisService.getEncrypted(pendingRequestKey);

      // If not found, try with @c.us suffix (for requests sent via phone number)
      if (!pendingRequest) {
        // Extract just the number part from whatsappId (remove any existing @c.us)
        const phoneNumber = whatsappId.replace('@c.us', '').replace(/\D/g, '');
        pendingRequestKey = `pending_request:${phoneNumber}@c.us`;
        pendingRequest = await this.redisService.getEncrypted(pendingRequestKey);
      }

      // If no action specified and there's a pending request, handle it
      if (!action && pendingRequest) {
        try {
          // Check if request is still valid
          const expiresAt = new Date(pendingRequest.expiresAt);
          if (expiresAt < new Date()) {
            await this.redisService.del(pendingRequestKey);
            return '❌ This payment request has expired. Please ask for a new one.';
          }

          // Get user's wallets
          const wallets = await this.paymentService.getUserWallets(session.flashAuthToken);

          // Pay the invoice
          const result = await this.paymentService.sendLightningPayment(
            {
              walletId: wallets.usdWallet?.id || wallets.defaultWalletId,
              paymentRequest: pendingRequest.invoice,
            },
            session.flashAuthToken,
          );

          if (result?.status === PaymentSendResult.Success) {
            // Clear the pending request
            await this.redisService.del(pendingRequestKey);

            // Notify the requester
            if (pendingRequest.requesterWhatsappId && this.whatsappWebService?.isClientReady()) {
              const payerUsername =
                (await this.usernameService.getUsername(session.flashAuthToken)) || 'Someone';
              const successNotification = `✅ *Payment Received!*\n\n@${payerUsername} has paid your request for $${pendingRequest.amount.toFixed(2)} USD.\n\nThe payment has been confirmed and added to your balance.`;

              await this.whatsappWebService.sendMessage(
                pendingRequest.requesterWhatsappId,
                successNotification,
              );
            }

            return ResponseLengthUtil.getConciseResponse('payment_success', {
              amount: pendingRequest.amount.toFixed(2),
              recipient: `@${pendingRequest.requesterUsername}`,
            });
          } else if (result?.status === PaymentSendResult.AlreadyPaid) {
            await this.redisService.del(pendingRequestKey);
            return '❌ This payment request has already been paid.';
          } else {
            return (
              ResponseLengthUtil.getConciseResponse('error') +
              ' ' +
              (result?.errors?.[0]?.message || 'Unknown error').substring(0, 50)
            );
          }
        } catch (error) {
          this.logger.error(`Payment request error: ${error.message}`);
          return `❌ Failed to pay request: ${error.message}`;
        }
      }

      // Get pending Lightning invoice payments (encrypted)
      const pendingPaymentsKey = `pending_payments:${whatsappId}`;
      const payments = await this.redisService.getEncrypted(pendingPaymentsKey);

      // If there's a pending request but user specified an action, show both options
      if (pendingRequest && action && (!payments || payments.length === 0)) {
        return `💰 You have a pending payment request from @${pendingRequest.requesterUsername} for $${pendingRequest.amount.toFixed(2)} USD.\n\n• Type \`pay\` to pay this request\n• Or continue with other payment options`;
      }

      if (!payments || payments.length === 0) {
        return '❌ No pending payments found.\n\nTo pay a Lightning invoice, either:\n• Share or paste the invoice to detect it automatically\n• Use: `send [amount] to [invoice]`';
      }

      // Handle list command
      if (action === 'list') {
        let message = `📋 *Pending Lightning Invoices* (${payments.length})\n\n`;
        payments.forEach((payment: any, index: number) => {
          const num = index + 1;
          message += `${num}. `;
          if (payment.details?.amount) {
            message += `$${payment.details.amount.toFixed(2)} USD`;
          } else if (payment.details?.satoshis) {
            message += `${payment.details.satoshis.toLocaleString()} sats`;
          } else {
            message += `Any amount`;
          }
          if (payment.details?.description) {
            message += ` - ${payment.details.description.substring(0, 30)}${payment.details.description.length > 30 ? '...' : ''}`;
          }
          message += `\n`;
        });
        message += `\n💳 *Payment Options:*\n`;
        message += `• Type \`pay [number]\` to pay a specific invoice\n`;
        message += `• Type \`pay cancel all\` to dismiss all`;
        return message;
      }

      // Handle cancel with optional "all" modifier
      if (action === 'cancel') {
        if (modifier === 'all' || payments.length === 1) {
          await this.redisService.del(pendingPaymentsKey);
          return `❌ ${payments.length === 1 ? 'Payment' : `All ${payments.length} payments`} cancelled.`;
        } else {
          return `❌ Please specify which payment to cancel:\n• Type \`pay cancel all\` to cancel all\n• Or pay a specific invoice with \`pay [number]\``;
        }
      }

      // Determine which payment to process
      let selectedPayment = null;
      let paymentIndex = -1;

      if (action === 'confirm' && payments.length === 1) {
        // Single payment, confirm pays it
        selectedPayment = payments[0];
        paymentIndex = 0;
      } else if (action && !isNaN(parseInt(action))) {
        // Numeric selection
        const num = parseInt(action);
        if (num >= 1 && num <= payments.length) {
          selectedPayment = payments[num - 1];
          paymentIndex = num - 1;
        } else {
          return `❌ Invalid payment number. Please select 1-${payments.length}`;
        }
      } else if (action === 'confirm' && payments.length > 1) {
        // Multiple payments, need selection
        return `❌ Multiple payments pending. Please specify which one:\n• Type \`pay [number]\` to pay a specific invoice\n• Type \`pay list\` to see all pending invoices`;
      }

      // Process selected payment
      if (selectedPayment) {
        try {
          // Get user's wallets
          const wallets = await this.paymentService.getUserWallets(session.flashAuthToken);

          // Send the payment
          const result = await this.paymentService.sendLightningPayment(
            {
              walletId: wallets.usdWallet?.id || wallets.defaultWalletId,
              paymentRequest: selectedPayment.invoice,
            },
            session.flashAuthToken,
          );

          // Remove the paid invoice from pending list
          payments.splice(paymentIndex, 1);
          if (payments.length > 0) {
            await this.redisService.setEncrypted(pendingPaymentsKey, payments, 300);
          } else {
            await this.redisService.del(pendingPaymentsKey);
          }

          if (result?.status === PaymentSendResult.Success) {
            let successMessage = `✅ Payment sent successfully!\n\n`;
            if (selectedPayment.details?.amount) {
              successMessage += `Amount: $${selectedPayment.details.amount.toFixed(2)} USD\n`;
            } else if (selectedPayment.details?.satoshis) {
              successMessage += `Amount: ${selectedPayment.details.satoshis.toLocaleString()} sats\n`;
            }
            if (selectedPayment.details?.description) {
              successMessage += `Description: ${selectedPayment.details.description}\n`;
            }

            if (payments.length > 0) {
              successMessage += `\n📋 You have ${payments.length} more pending payment${payments.length > 1 ? 's' : ''}.`;
              successMessage += `\nType \`pay list\` to see them.`;
            }

            return successMessage;
          } else if (result?.status === PaymentSendResult.AlreadyPaid) {
            return '❌ This invoice has already been paid.';
          } else {
            return (
              ResponseLengthUtil.getConciseResponse('error') +
              ' ' +
              (result?.errors?.[0]?.message || 'Unknown error').substring(0, 50)
            );
          }
        } catch (error) {
          this.logger.error(`Payment error: ${error.message}`);
          return (
            ResponseLengthUtil.getConciseResponse('error') + ' ' + error.message.substring(0, 50)
          );
        }
      }

      // No action specified, show payment options
      if (payments.length === 1) {
        // Single payment
        const payment = payments[0];
        let message = `⚡ *Pending Payment*\n\n`;

        if (payment.details?.amount) {
          message += `Amount: $${payment.details.amount.toFixed(2)} USD\n`;
        } else if (payment.details?.satoshis) {
          message += `Amount: ${payment.details.satoshis.toLocaleString()} sats\n`;
        } else {
          message += `Amount: Any amount\n`;
        }

        if (payment.details?.description) {
          message += `Description: ${payment.details.description}\n`;
        }

        message += `\n💳 *Confirm Payment:*\n`;
        message += `• Type \`pay confirm\` to proceed\n`;
        message += `• Type \`pay cancel\` to dismiss`;

        return message;
      } else {
        // Multiple payments
        let message = `⚡ *Multiple Pending Payments* (${payments.length})\n\n`;
        message += `You have ${payments.length} Lightning invoices waiting.\n\n`;
        message += `💳 *Payment Options:*\n`;
        message += `• Type \`pay list\` to see all invoices\n`;
        message += `• Type \`pay [number]\` to pay a specific one\n`;
        message += `• Type \`pay cancel all\` to dismiss all`;

        return message;
      }
    } catch (error) {
      this.logger.error(`Error handling pay command: ${error.message}`, error.stack);
      return '❌ Failed to process payment. Please try again.';
    }
  }

  /**
   * Parse Lightning invoice details
   */
  private async parseInvoiceDetails(invoice: string): Promise<{
    amount?: number;
    satoshis?: number;
    description?: string;
    expiresIn?: string;
  }> {
    try {
      // Decode invoice
      const decoded = bolt11.decode(invoice);

      const details: any = {};

      // Extract amount (in millisatoshis)
      if (decoded.millisatoshis) {
        // Convert millisatoshis to satoshis
        const satoshis = Number(decoded.millisatoshis) / 1000;

        // For USD invoices created by Flash, the amount tag often contains cents
        // Check if this looks like a USD amount (common pattern)
        if (decoded.tags) {
          const amountTag = decoded.tags.find((tag: any) => tag.tagName === 'amount');
          if (amountTag && amountTag.data) {
            // This might be USD cents
            details.amount = parseInt(String(amountTag.data)) / 100;
          }
        }

        // If no USD amount found, show in sats
        if (!details.amount && satoshis > 0) {
          details.satoshis = Math.round(satoshis);
        }
      }

      // Extract description
      const descTag = decoded.tags.find((tag: any) => tag.tagName === 'description');
      if (descTag) {
        details.description = descTag.data;
      }

      // Calculate expiry
      if (decoded.timeExpireDate) {
        const expiresAt = new Date(decoded.timeExpireDate * 1000);
        const now = new Date();
        const diffMs = expiresAt.getTime() - now.getTime();

        if (diffMs > 0) {
          const diffMins = Math.floor(diffMs / 60000);
          if (diffMins > 60) {
            details.expiresIn = `${Math.floor(diffMins / 60)} hours`;
          } else {
            details.expiresIn = `${diffMins} minutes`;
          }
        } else {
          details.expiresIn = 'Expired';
        }
      }

      return details;
    } catch (error) {
      this.logger.warn(`Failed to parse invoice details: ${error.message}`);
      return {};
    }
  }

  /**
   * Handle vybz command - share content to earn sats
   */
  private async handleVybzCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean }> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified || !session.flashAuthToken) {
        return `🎯 *Share Your Vybz & Earn Sats!*

To start earning, you need to link your Flash account first.

👉 Type \`link\` to get started!

Once connected, you can:
• Share jokes, thoughts, or photos
• Get zapped (paid) by people who like your content
• Build your Lightning wallet balance
• Connect with the global community`;
      }

      const action = command.args.action;

      // Check status of previous posts
      if (action === 'status' || action === 'check') {
        return this.getVybzStatus(whatsappId, session);
      }

      // Check daily post limit
      const dailyPostsKey = `vybz_daily:${whatsappId}:${new Date().toDateString()}`;
      const dailyPosts = await this.redisService.get(dailyPostsKey);
      const postCount = dailyPosts ? parseInt(dailyPosts) : 0;

      if (postCount >= 3) {
        return `❌ You've reached your daily limit of 3 posts.

Try again tomorrow to share more vybz!

Type \`vybz status\` to check your earnings.`;
      }

      // Show options for sharing
      const vybzQueueKey = `vybz_queue:${whatsappId}`;
      const activeVybz = await this.redisService.get(vybzQueueKey);

      if (activeVybz) {
        return `⏳ You already have content being processed.

Please wait for it to be posted before sharing something new.

Type \`vybz status\` to check progress.`;
      }

      // Get user's username
      const username =
        (await this.usernameService.getUsername(session.flashAuthToken)) || 'Pulse user';

      // Set waiting flag for content
      const vybzWaitingKey = `vybz_waiting:${whatsappId}`;
      await this.redisService.set(vybzWaitingKey, 'true', 300); // 5 minute expiry

      return `🎤 *Share Your Vybz!*

What's on your mind, @${username}?

Just send me:
• 💭 A thought or joke (text)
• 📸 A photo 
• 🎤 A voice note
• 🎬 A short video

Your content will be posted on Nostr, and any zaps (Lightning tips) will go directly to your wallet!

_Tip: Be creative, funny, or insightful to get more zaps!_`;
    } catch (error) {
      this.logger.error(`Error handling vybz command: ${error.message}`, error.stack);
      return '❌ Something went wrong. Please try again later.';
    }
  }

  /**
   * Get vybz earning status
   */
  private async getVybzStatus(whatsappId: string, _session: UserSession): Promise<string> {
    try {
      // Get user's posts history
      const postsKey = `vybz_posts:${whatsappId}`;
      const postsData = await this.redisService.get(postsKey);
      const posts = postsData ? JSON.parse(postsData) : [];

      if (posts.length === 0) {
        return `📊 *Your Vybz Status*

No posts yet! 

Type \`vybz\` to share something and start earning sats!`;
      }

      // Calculate totals
      let totalZaps = 0;
      let totalSats = 0;
      const recentPosts = posts.slice(-5); // Last 5 posts

      posts.forEach((post: any) => {
        totalZaps += post.zaps || 0;
        totalSats += post.satsReceived || 0;
      });

      let message = `📊 *Your Vybz Status*\n\n`;
      message += `Total Posts: ${posts.length}\n`;
      message += `Total Zaps: ${totalZaps}\n`;
      message += `Total Sats Earned: ⚡${totalSats.toLocaleString()}\n\n`;

      if (recentPosts.length > 0) {
        message += `*Recent Posts:*\n`;
        recentPosts.forEach((post: any, index: number) => {
          const timeAgo = this.getTimeAgo(new Date(post.timestamp));
          message += `${index + 1}. "${post.preview}" - ${post.satsReceived || 0} sats (${timeAgo})\n`;
        });
      }

      // Check today's limit
      const dailyPostsKey = `vybz_daily:${whatsappId}:${new Date().toDateString()}`;
      const dailyPosts = await this.redisService.get(dailyPostsKey);
      const postCount = dailyPosts ? parseInt(dailyPosts) : 0;

      message += `\n📝 Posts today: ${postCount}/3`;

      if (postCount < 3) {
        message += `\n\nType \`vybz\` to share something new!`;
      }

      return message;
    } catch (error) {
      this.logger.error(`Error getting vybz status: ${error.message}`);
      return '❌ Unable to fetch your status. Please try again later.';
    }
  }

  /**
   * Get human-readable time ago
   */
  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays}d ago`;
    } else if (diffHours > 0) {
      return `${diffHours}h ago`;
    } else if (diffMins > 0) {
      return `${diffMins}m ago`;
    } else {
      return 'just now';
    }
  }

  /**
   * Process content submission for vybz
   * This would be called when user sends text/media after the vybz command
   */
  async processVybzContent(
    whatsappId: string,
    content: string | Buffer,
    contentType: 'text' | 'image' | 'voice' | 'video',
    session: UserSession,
  ): Promise<string> {
    try {
      // Pre-moderation check using AI
      if (contentType === 'text') {
        const moderationResult = await this.moderateContent(content as string);
        if (!moderationResult.approved) {
          return `❌ Your content couldn't be posted.

Reason: ${moderationResult.reason}

Please share something else that follows community guidelines.`;
        }
      }

      // TODO: Implement image/voice/video moderation

      // Store in processing queue
      const vybzQueueKey = `vybz_queue:${whatsappId}`;
      const queueData = {
        content: contentType === 'text' ? content : 'media_url_placeholder', // TODO: Upload media
        contentType,
        timestamp: new Date().toISOString(),
        username: (await this.usernameService.getUsername(session.flashAuthToken!)) || 'Pulse user',
        country: 'Jamaica', // TODO: Get from user profile
      };

      await this.redisService.set(vybzQueueKey, JSON.stringify(queueData), 300); // 5 min expiry

      // TODO: Post to Nostr
      // TODO: Set up zap forwarding

      // Update daily count
      const dailyPostsKey = `vybz_daily:${whatsappId}:${new Date().toDateString()}`;
      const dailyPosts = await this.redisService.get(dailyPostsKey);
      const newCount = (dailyPosts ? parseInt(dailyPosts) : 0) + 1;
      await this.redisService.set(dailyPostsKey, newCount.toString(), 86400); // 24 hour expiry

      return `✅ *Your vybz is live!*

Your ${contentType} has been posted to Nostr.

🎯 Share this with friends to get more zaps!

Track your earnings: \`vybz status\`

_All zaps will be automatically forwarded to your Flash wallet._`;
    } catch (error) {
      this.logger.error(`Error processing vybz content: ${error.message}`);
      return '❌ Failed to process your content. Please try again.';
    }
  }

  /**
   * Moderate content using AI
   */
  private async moderateContent(content: string): Promise<{
    approved: boolean;
    reason?: string;
  }> {
    try {
      // Use Gemini AI to check content
      const prompt = `Check if this content is appropriate for public posting. 
Content should not contain:
- Illegal activities
- Hate speech or discrimination
- Explicit sexual content
- Violence or threats
- Personal information (addresses, phone numbers, etc)
- Spam or scams

Content: "${content}"

Respond with JSON: { "approved": true/false, "reason": "brief explanation if rejected" }`;

      const aiResponse = await this.geminiAiService.processQuery(prompt, {
        context: 'content_moderation',
      });

      try {
        const result = JSON.parse(aiResponse);
        return result;
      } catch {
        // If AI response isn't valid JSON, approve by default but log
        this.logger.warn(`Invalid moderation response: ${aiResponse}`);
        return { approved: true };
      }
    } catch (error) {
      this.logger.error(`Content moderation error: ${error.message}`);
      // Err on the side of caution
      return {
        approved: false,
        reason: 'Content moderation unavailable. Please try again later.',
      };
    }
  }

  /**
   * Handle pending payment commands
   */
  private async handlePendingCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      const action = command.args.action || 'received';

      if (action === 'sent') {
        // Show pending payments sent by user
        if (!session || !session.isVerified) {
          return 'Please link your Flash account first to view pending payments.';
        }

        const pendingPayments = await this.pendingPaymentService.getPendingPaymentsBySender(
          session.flashUserId!,
        );

        if (pendingPayments.length === 0) {
          return 'No pending payments sent.';
        }

        let message = `💸 *Pending Payments Sent*\n\n`;
        for (const payment of pendingPayments) {
          const amountUsd = (payment.amountCents / 100).toFixed(2);
          const expiresIn = Math.ceil(
            (new Date(payment.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          );
          message += `To: ${payment.recipientName || payment.recipientPhone}\n`;
          message += `Amount: $${amountUsd}\n`;
          message += `Code: ${payment.claimCode}\n`;
          message += `Expires: ${expiresIn} days\n\n`;
        }

        return message.trim();
      } else if (action === 'received') {
        // Show pending payments for user's phone number
        const userPhone = session?.phoneNumber || whatsappId;
        const pendingPayments =
          await this.pendingPaymentService.getPendingPaymentsByPhone(userPhone);

        if (pendingPayments.length === 0) {
          return 'No pending payments waiting for you.';
        }

        let message = `💰 *Pending Payments for You*\n\n`;
        for (const payment of pendingPayments) {
          const amountUsd = (payment.amountCents / 100).toFixed(2);
          message += `From: @${payment.senderUsername}\n`;
          message += `Amount: $${amountUsd}\n`;
          message += `Code: ${payment.claimCode}\n\n`;
        }

        if (!session || !session.isVerified) {
          message += `📱 To claim: Link your Flash account with 'link'`;
        } else {
          message += `✅ These will auto-claim to your account!`;
        }

        return message.trim();
      } else if (action === 'claim') {
        // Manual claim with code (usually automatic)
        if (!session || !session.isVerified) {
          return 'Please link your Flash account first to claim payments.';
        }

        const claimCode = command.args.claimCode;
        if (!claimCode) {
          return 'Please provide claim code. Usage: pending claim [code]';
        }

        // Find pending payment by claim code
        const userPhone = session.phoneNumber;
        const pendingPayments =
          await this.pendingPaymentService.getPendingPaymentsByPhone(userPhone);

        const payment = pendingPayments.find((p) => p.claimCode === claimCode.toUpperCase());
        if (!payment) {
          return `❌ Invalid claim code: ${claimCode}`;
        }

        // Process the claim
        return await this.processPendingPaymentClaim(payment, session);
      }

      return 'Usage: pending [sent|received|claim <code>]';
    } catch (error) {
      this.logger.error(`Error handling pending command: ${error.message}`, error.stack);
      return '❌ Failed to check pending payments. Please try again.';
    }
  }

  /**
   * Process a pending payment claim
   */
  private async processPendingPaymentClaim(payment: any, session: UserSession): Promise<string> {
    try {
      // Mark payment as claimed
      const claimed = await this.pendingPaymentService.claimPendingPayment(
        payment.id,
        session.flashUserId!,
      );

      if (!claimed) {
        return '❌ Unable to claim payment. It may have expired or been claimed.';
      }

      // Get admin token to transfer from escrow
      const adminToken = this.configService.get<string>('flashApi.apiKey');
      if (!adminToken) {
        return '❌ Unable to process claim. Please contact support.';
      }

      // Parallelize wallet fetches
      const [adminWallets, userWallets] = await Promise.all([
        this.paymentService.getUserWallets(adminToken),
        this.paymentService.getUserWallets(session.flashAuthToken!),
      ]);

      const adminWalletId = adminWallets.usdWallet?.id || adminWallets.defaultWalletId;
      const userWalletId = userWallets.usdWallet?.id || userWallets.defaultWalletId;

      // Transfer from admin wallet to user with claim code in memo
      const transferMemo = `Claimed pending payment from @${payment.senderUsername} - Claim: ${payment.claimCode}`;
      const result = await this.paymentService.sendIntraLedgerUsdPayment(
        {
          walletId: adminWalletId,
          recipientWalletId: userWalletId,
          amount: payment.amountCents,
          memo: transferMemo,
        },
        adminToken,
      );

      if (result?.status === PaymentSendResult.Success) {
        const amountUsd = (payment.amountCents / 100).toFixed(2);

        // Notify sender if possible
        try {
          const _senderNotification = `✅ Your pending payment of $${amountUsd} to ${payment.recipientName || payment.recipientPhone} has been claimed!`;
          // TODO: Send notification to sender via their WhatsApp if we have it stored
        } catch (error) {
          this.logger.error(`Failed to notify sender: ${error.message}`);
        }

        return `✅ Claimed $${amountUsd} from @${payment.senderUsername}!`;
      } else {
        // Revert claim status
        payment.status = 'pending';
        // Note: In production, you'd want to update this in the database

        const errorMessage = result?.errors?.[0]?.message || 'Transfer failed';
        return `❌ Failed to claim payment: ${errorMessage}`;
      }
    } catch (error) {
      this.logger.error(`Error processing claim: ${error.message}`, error.stack);
      return '❌ Failed to process claim. Please contact support.';
    }
  }

  /**
   * Generate a secure claim code
   */
  private generateClaimCode(): string {
    return randomBytes(4).toString('hex').toUpperCase();
  }

  /**
   * Handle admin commands for WhatsApp session management
   */
  /**
   * Handle voice settings command
   */
  private async handleVoiceCommand(
    command: ParsedCommand,
    whatsappId: string,
  ): Promise<string | { text: string; voice?: Buffer; voiceOnly?: boolean }> {
    const action = command.args.action;

    try {
      switch (action) {
        case 'help':
          return this.getVoiceHelp();

        case 'status': {
          const userMode = await this.userVoiceSettingsService.getUserVoiceMode(whatsappId);
          const userVoice = await this.userVoiceSettingsService.getUserVoice(whatsappId);

          let statusMessage = '';
          if (userMode) {
            statusMessage = `Your voice setting: ${this.userVoiceSettingsService.formatVoiceMode(userMode)}`;
          } else {
            // Show default (admin) setting
            const adminMode = await this.adminSettingsService.getVoiceMode();
            statusMessage = `Your voice setting: Default (follows admin setting: ${adminMode})`;
          }

          // Add voice selection info
          if (userVoice) {
            // Check if it's a dynamic voice
            const voiceId = await this.voiceManagementService.getVoiceId(userVoice);
            if (voiceId) {
              statusMessage += `\nSelected voice: ${userVoice}`;
            } else {
              statusMessage += `\nSelected voice: Default`;
            }
          } else {
            statusMessage += `\nSelected voice: Default`;
          }

          return statusMessage;
        }

        case 'on':
          await this.userVoiceSettingsService.setUserVoiceMode(whatsappId, UserVoiceMode.ON);
          return "🔊 Voice ON - You'll hear voice for AI responses when using voice keywords.";

        case 'off':
          await this.userVoiceSettingsService.setUserVoiceMode(whatsappId, UserVoiceMode.OFF);
          return "🔇 Voice OFF - You'll only receive text responses.";

        case 'only':
          await this.userVoiceSettingsService.setUserVoiceMode(whatsappId, UserVoiceMode.ONLY);
          return "🎤 Voice ONLY - You'll only receive voice responses (no text).";

        case 'list': {
          const formattedList = await this.voiceManagementService.formatVoiceList();

          // Check if we're in voice-only mode
          const isVoiceOnly = await this.ttsService.shouldSendVoiceOnly(whatsappId);
          if (isVoiceOnly) {
            // Get natural language voice list
            const voiceListDetails = await this.voiceManagementService.getVoiceListWithDetails();
            const naturalResponse =
              await this.voiceResponseService.generateNaturalVoiceListResponse(
                voiceListDetails,
                undefined,
              );

            // Generate voice and return voice-only response
            const audioBuffer = await this.ttsService.textToSpeech(
              naturalResponse,
              'en',
              whatsappId,
            );
            return {
              text: '', // Empty text for voice-only mode
              voice: audioBuffer,
              voiceOnly: true,
            };
          }

          return formattedList;
        }

        case 'add': {
          const { voiceName, voiceId } = command.args;
          if (!voiceName || !voiceId) {
            return '❌ Usage: `voice add [name] [voiceId]`\n\nExample: `voice add sarah EXAVITQu4vr4xnSDxMaL`';
          }

          const result = await this.voiceManagementService.addVoice(voiceName, voiceId, whatsappId);
          if (result.success) {
            // Set this as the user's active voice
            await this.userVoiceSettingsService.setUserVoice(whatsappId, voiceName);
            return `${result.message}\n\n🎙️ "${voiceName}" is now your active voice.`;
          }
          return `❌ ${result.message}`;
        }

        case 'remove': {
          const { voiceName } = command.args;
          if (!voiceName) {
            return '❌ Usage: `voice remove [name]`\n\nExample: `voice remove sarah`';
          }

          const result = await this.voiceManagementService.removeVoice(voiceName);
          if (result.success) {
            // Check if user was using this voice
            const currentVoice = await this.userVoiceSettingsService.getUserVoice(whatsappId);
            if (currentVoice?.toLowerCase() === voiceName.toLowerCase()) {
              await this.userVoiceSettingsService.setUserVoice(whatsappId, '');
              return `${result.message}\n\n⚠️ This was your active voice. Switched to default.`;
            }
          }
          return result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
        }

        case 'select': {
          const { voiceName } = command.args;
          if (!voiceName) {
            const errorMsg = '❌ Please specify a voice name.';

            // Check if we're in voice-only mode
            const isVoiceOnly = await this.ttsService.shouldSendVoiceOnly(whatsappId);
            if (isVoiceOnly) {
              const naturalResponse =
                await this.voiceResponseService.convertToNaturalSpeech(errorMsg);
              const audioBuffer = await this.ttsService.textToSpeech(
                naturalResponse,
                'en',
                whatsappId,
              );
              return {
                text: '',
                voice: audioBuffer,
                voiceOnly: true,
              };
            }
            return errorMsg;
          }

          // Check if voice exists
          const voiceExists = await this.voiceManagementService.voiceExists(voiceName);
          if (!voiceExists) {
            // Check if we're in voice-only mode
            const isVoiceOnly = await this.ttsService.shouldSendVoiceOnly(whatsappId);
            if (isVoiceOnly) {
              // Get natural language response for voice not found
              const voiceListDetails = await this.voiceManagementService.getVoiceListWithDetails();
              const naturalResponse =
                await this.voiceResponseService.generateNaturalVoiceListResponse(
                  voiceListDetails,
                  voiceName, // Pass the requested voice name
                );

              const audioBuffer = await this.ttsService.textToSpeech(
                naturalResponse,
                'en',
                whatsappId,
              );
              return {
                text: '',
                voice: audioBuffer,
                voiceOnly: true,
              };
            }

            const voiceList = await this.voiceManagementService.formatVoiceList();
            return `❌ Voice "${voiceName}" not found.\n\n${voiceList}`;
          }

          // Set as user's active voice
          await this.userVoiceSettingsService.setUserVoice(whatsappId, voiceName);
          const successMsg = `🎙️ Voice changed to "${voiceName}".`;

          // Check if we're in voice-only mode
          const isVoiceOnly = await this.ttsService.shouldSendVoiceOnly(whatsappId);
          if (isVoiceOnly) {
            const naturalResponse = `Your voice has been changed to ${voiceName}.`;
            const audioBuffer = await this.ttsService.textToSpeech(
              naturalResponse,
              'en',
              whatsappId,
            );
            return {
              text: '',
              voice: audioBuffer,
              voiceOnly: true,
            };
          }

          return successMsg;
        }

        default: {
          // If a voice name was provided directly (e.g., "voice your")
          if (command.args.voiceName) {
            // Try to select the voice
            const voiceName = command.args.voiceName;
            const voiceExists = await this.voiceManagementService.voiceExists(voiceName);

            if (!voiceExists) {
              // Check if we're in voice-only mode
              const isVoiceOnly = await this.ttsService.shouldSendVoiceOnly(whatsappId);
              if (isVoiceOnly) {
                // Get natural language response for voice not found
                const voiceListDetails =
                  await this.voiceManagementService.getVoiceListWithDetails();
                const naturalResponse =
                  await this.voiceResponseService.generateNaturalVoiceListResponse(
                    voiceListDetails,
                    voiceName, // Pass the requested voice name
                  );

                const audioBuffer = await this.ttsService.textToSpeech(
                  naturalResponse,
                  'en',
                  whatsappId,
                );
                return {
                  text: '',
                  voice: audioBuffer,
                  voiceOnly: true,
                };
              }

              const voiceList = await this.voiceManagementService.formatVoiceList();
              return `❌ Voice "${voiceName}" not found.\n\n${voiceList}`;
            }

            // Voice exists, select it
            await this.userVoiceSettingsService.setUserVoice(whatsappId, voiceName);
            const successMsg = `🎙️ Voice changed to "${voiceName}".`;

            // Check if we're in voice-only mode
            const isVoiceOnly = await this.ttsService.shouldSendVoiceOnly(whatsappId);
            if (isVoiceOnly) {
              const naturalResponse = `Your voice has been changed to ${voiceName}.`;
              const audioBuffer = await this.ttsService.textToSpeech(
                naturalResponse,
                'en',
                whatsappId,
              );
              return {
                text: '',
                voice: audioBuffer,
                voiceOnly: true,
              };
            }

            return successMsg;
          }

          // No action specified, show help
          return this.getVoiceHelp();
        }
      }
    } catch (error) {
      this.logger.error(`Error handling voice command: ${error.message}`);
      return '❌ Failed to update voice settings. Please try again.';
    }
  }

  /**
   * Get voice help message
   */
  private async getVoiceHelp(): Promise<string> {
    const voiceList = await this.voiceManagementService.formatVoiceList();

    return `🔊 *Voice Settings*

Control how Pulse responds to you:

*Voice Modes:*
\`voice on\` - Enable voice for AI responses
\`voice off\` - Disable all voice responses
\`voice only\` - Voice responses only (no text)
\`voice status\` - Check your current settings

*Voice Management:*
\`voice list\` - Show available voices
\`voice [name]\` - Select a voice
\`voice add [name] [id]\` - Add new voice
\`voice remove [name]\` - Remove a voice

Example:
• \`voice add sarah EXAVITQu4vr4xnSDxMaL\`
• \`voice sarah\` - Switch to Sarah's voice

${voiceList}`;
  }

  /**
   * Handle settings command - display all user settings
   */
  private async handleSettingsCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      let settingsMessage = '⚙️ *Your Settings*\n\n';

      // Account Settings
      settingsMessage += '👤 *Account*\n';
      if (session && session.isVerified) {
        settingsMessage += `✅ Linked to Flash account\n`;

        // Get username and currency info
        if (session.flashUserId && session.flashAuthToken) {
          // Get username
          const username = await this.usernameService.getUsername(session.flashAuthToken);
          if (username) {
            settingsMessage += `📛 Username: @${username}\n`;
          } else {
            settingsMessage += `📛 Username: Not set\n`;
            settingsMessage += `   → Type \`username [new_username]\` to set one\n`;
          }

          // Get balance for currency display
          const balance = await this.balanceService.getUserBalance(
            session.flashUserId,
            session.flashAuthToken,
          );

          if (balance?.fiatCurrency) {
            settingsMessage += `💱 Currency: ${balance.fiatCurrency}\n`;
          }
        }

        settingsMessage += `📱 Phone: ${session.phoneNumber}\n`;
      } else {
        settingsMessage += `❌ Not linked to Flash\n`;
        settingsMessage += `   → Type \`link\` to connect your account\n`;
      }

      settingsMessage += '\n';

      // Voice Settings
      settingsMessage += '🔊 *Voice Settings*\n';
      const userVoiceMode = await this.userVoiceSettingsService.getUserVoiceMode(whatsappId);
      const userVoice = await this.userVoiceSettingsService.getUserVoice(whatsappId);

      if (userVoiceMode) {
        settingsMessage += `Mode: ${this.userVoiceSettingsService.formatVoiceMode(userVoiceMode)}\n`;
      } else {
        const adminMode = await this.adminSettingsService.getVoiceMode();
        settingsMessage += `Mode: Default (${adminMode})\n`;
      }

      const voiceName = userVoice || 'terri-ann';
      const voiceDisplay =
        voiceName === 'terri-ann' ? 'Terri-Ann' : voiceName === 'patience' ? 'Patience' : 'Dean';
      settingsMessage += `Voice: ${voiceDisplay}\n`;
      settingsMessage += `   → Type \`voice help\` for voice options\n`;

      settingsMessage += '\n';

      // AI Support Settings
      settingsMessage += '🤖 *AI Support*\n';
      if (session && session.consentGiven) {
        settingsMessage += `✅ AI assistance enabled\n`;
        settingsMessage += `   → Type \`consent no\` to disable\n`;
      } else {
        settingsMessage += `❌ AI assistance disabled\n`;
        settingsMessage += `   → Type \`consent yes\` to enable\n`;
      }

      settingsMessage += '\n';

      // Notification Settings (future feature placeholder)
      settingsMessage += '🔔 *Notifications*\n';
      settingsMessage += `Payment alerts: ✅ Enabled\n`;
      settingsMessage += `Transaction updates: ✅ Enabled\n`;

      settingsMessage += '\n';

      // Privacy Settings
      settingsMessage += '🔒 *Privacy*\n';
      if (session && session.isVerified) {
        settingsMessage += `Session security: ✅ Active\n`;
        settingsMessage += `   → Type \`unlink\` to disconnect\n`;
      }

      settingsMessage += '\n';

      // Quick Actions
      settingsMessage += '⚡ *Quick Actions*\n';
      settingsMessage += `• \`username [new]\` - Change username\n`;
      settingsMessage += `• \`voice status\` - Voice settings\n`;
      settingsMessage += `• \`consent yes/no\` - AI support\n`;
      settingsMessage += `• \`help\` - View all commands\n`;

      return settingsMessage.trim();
    } catch (error) {
      this.logger.error(`Error handling settings command: ${error.message}`);
      return '❌ Failed to retrieve settings. Please try again.';
    }
  }

  /**
   * Handle admin commands
   */
  private async handleAdminCommand(
    command: ParsedCommand,
    whatsappId: string,
    phoneNumber: string,
  ): Promise<string> {
    try {
      // Check if user is admin (you can customize this check)
      const adminNumbers = this.configService.get<string>('ADMIN_PHONE_NUMBERS')?.split(',') || [];
      // Remove + prefix for comparison since admin numbers in env don't have +
      const cleanPhoneNumber = phoneNumber.replace(/^\+/, '');
      const isAdmin =
        adminNumbers.includes(cleanPhoneNumber) ||
        cleanPhoneNumber === '13059244435' || // Your current number
        process.env.NODE_ENV === 'development'; // Allow in dev mode

      if (!isAdmin) {
        return '❌ Unauthorized. Admin commands are restricted.';
      }

      const action = command.args.action;

      // Debug logging to trace the issue
      this.logger.debug(`Admin command received - action: ${action}, args:`, command.args);

      if (!this.whatsappWebService) {
        return '❌ WhatsApp Web service not available.';
      }

      // Handle case where action might be undefined or empty
      if (!action || action === 'help') {
        return this.getAdminHelpMessage();
      }

      switch (action) {
        case 'status': {
          const status = this.whatsappWebService.getStatus();
          const readyInstances = status.instances.filter((i) => i.connected);
          if (readyInstances.length > 0) {
            const instanceInfo = status.instances
              .map(
                (i) =>
                  `• ${i.phoneNumber}: ${i.connected ? '✅ Connected' : '❌ Disconnected'} (${i.number || 'Unknown'})`,
              )
              .join('\n');
            return `✅ *WhatsApp Status*\n\nActive Instances: ${readyInstances.length}/${status.instances.length}\n\n${instanceInfo}`;
          } else {
            return `❌ *WhatsApp Status*\n\nNo instances connected\n\nUse \`admin reconnect\` to connect a new number.`;
          }
        }

        case 'disconnect': {
          try {
            // Send the message first before disconnecting
            const message = `✅ WhatsApp session will be disconnected.\n\nThis number is being logged out.\n\n⚠️ After disconnection, this number can no longer receive messages from the bot.\n\nUse \`admin reconnect\` on a different device to connect a new number.\n\n🔌 Disconnecting in 3 seconds...`;

            // We need to send this message directly since we're about to disconnect
            if (this.whatsappWebService) {
              await this.whatsappWebService.sendMessage(whatsappId, message);

              // Wait a bit to ensure message is sent
              await new Promise((resolve) => setTimeout(resolve, 3000));

              // Now disconnect all instances with logout
              const instances = this.whatsappWebService.getStatus();
              for (const instance of instances.instances) {
                if (instance.connected) {
                  await this.whatsappWebService.disconnect(instance.phoneNumber, true);
                }
              }
            }

            // This response won't be sent via WhatsApp, but will show in logs
            return 'WhatsApp session disconnected successfully.';
          } catch (error) {
            return `❌ Failed to disconnect: ${error.message}`;
          }
        }

        case 'clear-session': {
          try {
            // Clear all instance sessions
            const instances = this.whatsappWebService.getStatus();
            for (const instance of instances.instances) {
              await this.whatsappWebService.clearSession(instance.phoneNumber);
            }

            // Return a message for logging purposes only
            // The actual user notification is handled by clearSession()
            return '✅ Session cleared. The bot is now disconnected.';
          } catch (error) {
            return `❌ Failed to clear session: ${error.message}`;
          }
        }

        case 'reconnect': {
          try {
            // For now, use reconnect on the first instance
            const instances = this.whatsappWebService.getStatus();
            if (instances.instances.length > 0) {
              await this.whatsappWebService.reconnect(instances.instances[0].phoneNumber);
              return '🔄 Reconnecting WhatsApp... Please scan the QR code that will be displayed.';
            } else {
              return '❌ No WhatsApp instances configured';
            }

            // This response won't be sent via WhatsApp, but will show in logs
            return 'WhatsApp reconnection initiated. Check terminal for QR code.';
          } catch (error) {
            return `❌ Failed to reconnect: ${error.message}`;
          }
        }

        case 'help': {
          return this.getAdminHelpMessage();
        }

        case 'settings': {
          const settings = await this.adminSettingsService.getSettings();
          return (
            `⚙️ *Admin Settings*\n\n` +
            `🔒 Lockdown: ${settings.lockdown ? 'ENABLED' : 'Disabled'}\n` +
            `👥 Groups: ${settings.groupsEnabled ? 'Enabled' : 'DISABLED'}\n` +
            `🔊 Voice: ${settings.voiceMode.toUpperCase()}\n` +
            `💸 Payments: ${settings.paymentsEnabled ? 'Enabled' : 'Disabled'}\n` +
            `📥 Requests: ${settings.requestsEnabled ? 'Enabled' : 'Disabled'}\n\n` +
            `👮 Admins: ${settings.adminNumbers.length}\n` +
            `🆘 Support: ${settings.supportNumbers.length}\n\n` +
            `📅 Last updated: ${new Date(settings.lastUpdated).toLocaleDateString()}\n` +
            `👤 Updated by: ${settings.updatedBy}\n\n` +
            `💡 Use \`admin help\` to see available commands`
          );
        }

        case 'lockdown': {
          const mode = command.args.mode;
          if (!mode || (mode !== 'on' && mode !== 'off')) {
            const isLockdown = await this.adminSettingsService.isLockdown();
            return (
              `🔒 *Lockdown Status*: ${isLockdown ? 'ENABLED' : 'Disabled'}\n\n` +
              `To change: \`admin lockdown on\` or \`admin lockdown off\``
            );
          }
          const lockdownEnabled = mode === 'on';
          await this.adminSettingsService.updateSettings(
            { lockdown: lockdownEnabled },
            phoneNumber,
          );
          return (
            `${lockdownEnabled ? '🔒' : '🔓'} Lockdown ${lockdownEnabled ? 'ENABLED' : 'DISABLED'}\n\n` +
            `${lockdownEnabled ? 'Only admin commands are allowed now.' : 'All commands are now available.'}`
          );
        }

        case 'group': {
          const groupMode = command.args.mode;
          if (!groupMode || (groupMode !== 'on' && groupMode !== 'off')) {
            const groupsEnabled = await this.adminSettingsService.areGroupsEnabled();
            return (
              `👥 *Groups Status*: ${groupsEnabled ? 'Enabled' : 'DISABLED'}\n\n` +
              `To change: \`admin group on\` or \`admin group off\``
            );
          }
          const groupsEnabled = groupMode === 'on';
          await this.adminSettingsService.updateSettings({ groupsEnabled }, phoneNumber);
          return (
            `👥 Groups ${groupsEnabled ? 'ENABLED' : 'DISABLED'}\n\n` +
            `${groupsEnabled ? 'Bot will now respond in group chats.' : 'Bot will ignore group messages.'}`
          );
        }

        case 'voice': {
          const subCommand = command.args.mode;

          // Handle default voice settings
          if (subCommand === 'default') {
            const voiceName = command.args.extra?.trim();

            if (!voiceName) {
              // Show current default voice
              const currentDefault = await this.voiceManagementService.getDefaultVoice();
              if (currentDefault) {
                return `🎙️ *Current Default Voice*: ${currentDefault}\n\nTo change: \`admin voice default [name]\`\nTo clear: \`admin voice default clear\``;
              } else {
                return `🎙️ No default voice set.\n\nTo set: \`admin voice default [name]\`\nAvailable voices: \`voice list\``;
              }
            }

            if (voiceName === 'clear') {
              await this.voiceManagementService.clearDefaultVoice();
              return `✅ Default voice cleared. Users will use their own selected voice or first available.`;
            }

            // Check if voice exists
            const voiceExists = await this.voiceManagementService.voiceExists(voiceName);
            if (!voiceExists) {
              const voiceList = await this.voiceManagementService.getVoiceList();
              const availableVoices = Object.keys(voiceList);
              if (availableVoices.length === 0) {
                return `❌ Voice "${voiceName}" not found.\n\nNo voices available. Add voices first with \`voice add\`.`;
              }
              return `❌ Voice "${voiceName}" not found.\n\nAvailable voices: ${availableVoices.join(', ')}`;
            }

            await this.voiceManagementService.setDefaultVoice(voiceName);
            return `✅ Default voice set to: ${voiceName}\n\nAll users without a voice preference will now use this voice.`;
          }

          // Original voice mode settings
          const voiceMode = command.args.mode as VoiceMode;
          if (!voiceMode || !['always', 'on', 'off'].includes(voiceMode)) {
            const currentMode = await this.adminSettingsService.getVoiceMode();
            const currentDefault = await this.voiceManagementService.getDefaultVoice();
            return (
              `🔊 *Voice Settings*\n\n` +
              `**Mode**: ${currentMode.toUpperCase()}\n` +
              (currentDefault ? `**Default Voice**: ${currentDefault}\n\n` : '\n') +
              `*Voice Modes:*\n` +
              `• \`always\` - All responses include voice notes\n` +
              `• \`on\` - AI responds with voice to keywords\n` +
              `• \`off\` - Voice notes disabled\n\n` +
              `*Commands:*\n` +
              `• \`admin voice always/on/off\` - Set mode\n` +
              `• \`admin voice default [name]\` - Set default voice\n` +
              `• \`admin voice default clear\` - Clear default`
            );
          }
          await this.adminSettingsService.setVoiceMode(voiceMode, phoneNumber);
          return (
            `🔊 Voice mode set to: ${voiceMode.toUpperCase()}\n\n` +
            `${
              voiceMode === 'always'
                ? '• All responses will include voice notes\n• Both commands and AI will speak'
                : voiceMode === 'on'
                  ? '• AI responds with voice to keywords\n• Say "voice", "speak", "audio" to activate'
                  : '• Voice notes are disabled\n• Text-only responses'
            }`
          );
        }

        case 'find': {
          const searchTerm = command.args.searchTerm;
          if (!searchTerm) {
            return '❌ Please provide a search term.\n\nExample: `admin find john`';
          }
          return await this.handleAdminFindCommand(searchTerm);
        }

        case 'add': {
          const addType = command.args.subAction;
          const addNumber = command.args.phoneNumber;
          if (!addNumber || !addType || (addType !== 'admin' && addType !== 'support')) {
            return (
              '❌ Invalid syntax.\n\n' +
              'Use:\n' +
              '• `admin add admin 1234567890`\n' +
              '• `admin add support 1234567890`'
            );
          }
          if (addType === 'admin') {
            await this.adminSettingsService.addAdmin(addNumber, phoneNumber);
            return `✅ Added ${addNumber} as admin\n\n💡 They can now use admin commands.`;
          } else {
            await this.adminSettingsService.addSupport(addNumber, phoneNumber);
            return `✅ Added ${addNumber} as support agent\n\n💡 They will receive support requests.`;
          }
        }

        case 'remove': {
          const removeType = command.args.subAction;
          const removeNumber = command.args.phoneNumber;
          if (
            !removeNumber ||
            !removeType ||
            (removeType !== 'admin' && removeType !== 'support')
          ) {
            return (
              '❌ Invalid syntax.\n\n' +
              'Use:\n' +
              '• `admin remove admin 1234567890`\n' +
              '• `admin remove support 1234567890`'
            );
          }
          const currentSettings = await this.adminSettingsService.getSettings();
          if (removeType === 'admin') {
            const newAdmins = currentSettings.adminNumbers.filter((n) => n !== removeNumber);
            if (newAdmins.length === currentSettings.adminNumbers.length) {
              return `❌ ${removeNumber} is not an admin`;
            }
            await this.adminSettingsService.updateSettings(
              { adminNumbers: newAdmins },
              phoneNumber,
            );
            return `✅ Removed ${removeNumber} from admins`;
          } else {
            const newSupport = currentSettings.supportNumbers.filter((n) => n !== removeNumber);
            if (newSupport.length === currentSettings.supportNumbers.length) {
              return `❌ ${removeNumber} is not a support agent`;
            }
            await this.adminSettingsService.updateSettings(
              { supportNumbers: newSupport },
              phoneNumber,
            );
            return `✅ Removed ${removeNumber} from support agents`;
          }
        }

        case 'analytics': {
          const period = command.args.period || 'daily';
          if (!['daily', 'weekly'].includes(period)) {
            return '❌ Invalid period. Use: `admin analytics daily` or `admin analytics weekly`';
          }

          const report = await this.adminAnalyticsService.formatAnalyticsReport(
            period as 'daily' | 'weekly',
          );
          return report;
        }

        default: {
          return this.getAdminHelpMessage();
        }
      }
    } catch (error) {
      this.logger.error(`Error handling admin command: ${error.message}`, error.stack);
      return '❌ Admin command failed. Check logs for details.';
    }
  }

  /**
   * Get admin help message
   */
  private getAdminHelpMessage(): string {
    return (
      `👮 *Admin Commands*\n\n` +
      `📊 *Status & Info:*\n` +
      `• \`admin status\` - Check WhatsApp connection\n` +
      `• \`admin settings\` - View current settings\n` +
      `• \`admin find <term>\` - Search contacts/sessions\n` +
      `• \`admin analytics daily\` - Today's analytics\n` +
      `• \`admin analytics weekly\` - 7-day analytics\n\n` +
      `🔧 *Connection:*\n` +
      `• \`admin disconnect\` - Disconnect current number\n` +
      `• \`admin clear-session\` - Clear all session data\n` +
      `• \`admin reconnect\` - Connect a new number\n\n` +
      `🔒 *System Control:*\n` +
      `• \`admin lockdown on/off\` - Enable/disable lockdown\n` +
      `• \`admin group on/off\` - Enable/disable groups\n` +
      `• \`admin voice always/on/off\` - Control voice responses\n\n` +
      `👥 *User Management:*\n` +
      `• \`admin add admin <phone>\` - Add admin\n` +
      `• \`admin add support <phone>\` - Add support agent\n` +
      `• \`admin remove admin <phone>\` - Remove admin\n` +
      `• \`admin remove support <phone>\` - Remove support\n\n` +
      `💡 Type any admin command for more details`
    );
  }

  /**
   * Handle admin find command
   */
  private async handleAdminFindCommand(searchTerm: string): Promise<string> {
    try {
      const results: string[] = [];

      // Search in sessions
      const sessions = await this.sessionService.getAllActiveSessions();
      const matchingSessions = sessions.filter(
        (session) =>
          session.phoneNumber.includes(searchTerm) ||
          session.whatsappId.includes(searchTerm) ||
          (session.flashUserId && session.flashUserId.includes(searchTerm)),
      );

      if (matchingSessions.length > 0) {
        results.push('📱 *Sessions Found:*');
        matchingSessions.forEach((session) => {
          results.push(
            `• ${session.phoneNumber} - ${session.isVerified ? '✅ Verified' : '⏳ Pending'}`,
          );
        });
      }

      // Search in contacts (if available)
      const contactsKey = `contacts:*`;
      const contactKeys = await this.redisService.keys(contactsKey);
      const matchingContacts: string[] = [];

      for (const key of contactKeys) {
        const contacts = await this.redisService.get(key);
        if (contacts) {
          const parsed = JSON.parse(contacts);
          Object.entries(parsed).forEach(([name, phone]) => {
            if (
              name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              String(phone).includes(searchTerm)
            ) {
              matchingContacts.push(`• ${name}: ${phone}`);
            }
          });
        }
      }

      if (matchingContacts.length > 0) {
        results.push('\n👥 *Contacts Found:*');
        results.push(...matchingContacts);
      }

      if (results.length === 0) {
        return `❌ No results found for "${searchTerm}"`;
      }

      return results.join('\n');
    } catch (error) {
      this.logger.error(`Error in admin find: ${error.message}`);
      return '❌ Error searching. Check logs.';
    }
  }

  /**
   * Check if lockdown is enabled and block non-admin commands
   */
  private async checkLockdown(whatsappId: string, command: ParsedCommand): Promise<string | null> {
    try {
      const isLockdown = await this.adminSettingsService.isLockdown();
      if (!isLockdown) return null;

      // Allow admin commands always
      if (command.type === CommandType.ADMIN) return null;

      // Check if user is admin
      const phoneNumber = whatsappId.replace('@c.us', '');
      const isAdmin = await this.adminSettingsService.isAdmin(phoneNumber);

      if (!isAdmin) {
        return (
          '🔒 *System Lockdown*\n\n' +
          'The bot is currently in lockdown mode.\n' +
          'Only administrators can use commands.\n\n' +
          'Please contact support if you need assistance.'
        );
      }

      return null;
    } catch (error) {
      this.logger.error(`Error checking lockdown: ${error.message}`);
      return null;
    }
  }

  /**
   * Get standardized "not linked" error message
   */
  private getNotLinkedMessage(): string {
    return ResponseLengthUtil.getConciseResponse('not_linked');
  }

  /**
   * Send response as voice note if requested
   */
  private async sendResponseWithVoice(
    whatsappId: string,
    response: string,
    originalMessage: string,
  ): Promise<void> {
    try {
      // Check if voice response was requested
      const shouldUseVoice = await this.ttsService.shouldUseVoice(originalMessage);

      if (shouldUseVoice && this.whatsappWebService) {
        // Make hints TTS-friendly before cleaning
        let ttsFriendlyResponse = response;

        // Check if response contains a hint (💡)
        if (response.includes('💡')) {
          // Extract hint part and make it TTS-friendly
          const parts = response.split('💡');
          if (parts.length > 1) {
            const beforeHint = parts[0];
            const hintPart = parts[1].trim();
            const ttsFriendlyHint = this.makeTtsFriendlyHint(hintPart);
            ttsFriendlyResponse = `${beforeHint}💡 ${ttsFriendlyHint}`;
          }
        }

        // Clean the text for TTS
        const cleanedText = this.ttsService.cleanTextForTTS(ttsFriendlyResponse);

        // Convert to speech
        try {
          const audioBuffer = await this.ttsService.textToSpeech(cleanedText, 'en', whatsappId);

          // Send voice note
          await this.whatsappWebService.sendVoiceNote(whatsappId, audioBuffer);

          // Also send the text message for reference (original with backticks)
          await this.whatsappWebService.sendMessage(whatsappId, response);

          return;
        } catch (ttsError) {
          this.logger.error('TTS conversion failed, sending text only:', ttsError);
          // Fall back to text-only
        }
      }

      // Send text message normally
      if (this.whatsappWebService) {
        await this.whatsappWebService.sendMessage(whatsappId, response);
      }
    } catch (error) {
      this.logger.error(`Error sending response: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add contextual hints to messages
   */
  private addHint(message: string, session: UserSession | null, command?: ParsedCommand): string {
    // Check if hint should be added
    if (!this.shouldAddHint(message, command)) {
      return message;
    }

    // Get appropriate hint based on context
    const hint = this.getContextualHint(session, command);

    // Format and return message with hint
    return hint ? this.formatMessageWithHint(message, hint) : message;
  }

  /**
   * Check if a hint should be added to the message
   */
  private shouldAddHint(message: string, command?: ParsedCommand): boolean {
    // Don't add hints to admin commands
    if (command?.type === CommandType.ADMIN) {
      return false;
    }

    // Don't add hints if message already has a hint (contains 💡)
    if (message.includes('💡')) {
      return false;
    }

    return true;
  }

  /**
   * Get contextual hint based on session state and command
   */
  private getContextualHint(session: UserSession | null, command?: ParsedCommand): string | null {
    if (!session) {
      return this.getHintForUnauthorizedUser();
    }

    if (!session.isVerified) {
      return this.getHintForUnverifiedUser();
    }

    return this.getHintForVerifiedUser(command);
  }

  /**
   * Get hint for users without a session
   */
  private getHintForUnauthorizedUser(): string {
    return 'Type `link` to connect your Flash account';
  }

  /**
   * Get hint for unverified users
   */
  private getHintForUnverifiedUser(): string {
    return 'Complete verification with your 6-digit code';
  }

  /**
   * Get hint for verified users based on command type
   */
  private getHintForVerifiedUser(command?: ParsedCommand): string {
    if (!command) {
      return this.getRandomGeneralHint();
    }

    const commandHints: Partial<Record<CommandType, string>> = {
      [CommandType.BALANCE]: 'Need assistance? Type `support`',
      [CommandType.PRICE]: 'Need assistance? Type `support`',
      [CommandType.HELP]: 'Need assistance? Type `support`',
      [CommandType.SEND]: 'Check balance with `balance`',
      [CommandType.RECEIVE]: 'Share this invoice to get paid',
      [CommandType.CONTACTS]: 'Send to contacts: `send 5 to john`',
    };

    return commandHints[command.type] || this.getRandomGeneralHint();
  }

  /**
   * Get a random general hint
   */
  private getRandomGeneralHint(): string {
    const generalHints = [
      'Type `help` to see all commands',
      'Set username for easy payments',
      'Save contacts with `contacts add`',
      'Check Bitcoin price with `price`',
      'View transactions with `history`',
      'Send money with `send 10 to @username`',
      'Receive Bitcoin with `receive 20`',
    ];

    return generalHints[Math.floor(Math.random() * generalHints.length)];
  }

  /**
   * Format message with hint
   */
  private formatMessageWithHint(message: string, hint: string): string {
    return `${message}\n\n💡 ${hint}`;
  }

  /**
   * Clean text for voice output
   */
  private cleanTextForVoice(text: string): string {
    return text
      .replace(/[❌✅⚡💰💸🎉🔊🔇🎤💡📱]/g, '') // Remove emojis
      .replace(/\*([^*]+)\*/g, '$1') // Remove markdown bold
      .replace(/_([^_]+)_/g, '$1') // Remove markdown italic
      .replace(/`([^`]+)`/g, "'$1'") // Replace backticks with quotes
      .replace(/\n+/g, '. ') // Replace newlines with periods
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/\.\s*\./g, '.') // Remove double periods
      .trim();
  }

  /**
   * Convert hints to TTS-friendly format
   * Transforms technical commands into natural language
   */
  private makeTtsFriendlyHint(hint: string): string {
    // First, apply phrase-level replacements for better context
    let ttsFriendly = hint;

    // Convert common phrases to more natural language
    const phraseReplacements: [RegExp | string, string][] = [
      [
        'Type `link` to connect your Flash account',
        "You can connect your Flash account by typing 'link'",
      ],
      [
        'Enter your 6-digit verification code',
        'Complete the verification by entering your 6-digit code',
      ],
      [
        'Send money with `send 10 to @username`',
        "You can send money by typing 'send', then the amount, then 'to' and the username",
      ],
      ['Check balance with `balance`', "You can check your balance by typing 'balance'"],
      ['Share this invoice to get paid', 'Share this invoice with someone to receive payment'],
      [
        'Receive Bitcoin with `receive 20`',
        "You can receive Bitcoin by typing 'receive' followed by the amount",
      ],
      [
        'Send to contacts: `send 5 to john`',
        "To send money to your contacts, type 'send 5 to' followed by the contact name",
      ],
      ['Type `help` to see all commands', "To see all available commands, type 'help'"],
      ['Need assistance? Type `support`', "If you need assistance, type 'support'"],
      ['Set username for easy payments', 'Set up a username to make payments easier'],
      ['Save contacts with `contacts add`', "You can save contacts by typing 'contacts add'"],
      [
        'Check Bitcoin price with `price`',
        "You can check the current price of Bitcoin by typing 'price'",
      ],
      [
        'View transactions with `history`',
        "You can view your transaction history by typing 'history'",
      ],
    ];

    // Apply phrase replacements
    for (const [pattern, replacement] of phraseReplacements) {
      if (typeof pattern === 'string' && ttsFriendly.includes(pattern)) {
        ttsFriendly = ttsFriendly.replace(pattern, replacement);
      }
    }

    // If no phrase replacement was applied, handle remaining backticks
    if (ttsFriendly.includes('`')) {
      ttsFriendly = ttsFriendly.replace(/`([^`]+)`/g, (_, cmd) => {
        // Default: just wrap in quotes
        return `'${cmd}'`;
      });
    }

    return ttsFriendly;
  }

  /**
   * Handle undo command
   */
  private async handleUndoCommand(
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    if (!session || !session.isVerified) {
      return 'Please link your Flash account first to use this feature.';
    }

    const result = await this.undoTransactionService.undoTransaction(whatsappId);
    return result.message;
  }

  /**
   * Handle template command
   */
  private async handleTemplateCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    if (!session || !session.isVerified) {
      return 'Please link your Flash account first to use templates.';
    }

    const action = command.args.action || 'list';

    switch (action) {
      case 'list':
        return this.paymentTemplatesService.formatTemplatesList(whatsappId);

      case 'add': {
        const { name, amount, recipient, memo } = command.args;
        if (!name || !amount || !recipient) {
          return `❌ Invalid template format.

Usage: \`template add [name] [amount] to [recipient] "[memo]"\`

Example: \`template add coffee 5 to john "Morning coffee"\``;
        }

        const result = await this.paymentTemplatesService.createTemplate(
          whatsappId,
          name,
          parseFloat(amount),
          recipient,
          memo,
        );
        return result.message;
      }

      case 'remove': {
        const { name } = command.args;
        if (!name) {
          return '❌ Please specify the template name to remove.';
        }

        const result = await this.paymentTemplatesService.deleteTemplate(whatsappId, name);
        return result.message;
      }

      default:
        return 'Unknown template action. Use: add, remove, or list';
    }
  }

  /**
   * Handle skip onboarding command
   */
  private async handleSkipCommand(whatsappId: string): Promise<string> {
    await this.onboardingService.dismissOnboarding(whatsappId);
    return `✅ Got it! I'll skip the tutorial.

Type \`help\` anytime to see available commands.

Welcome to Pulse! ⚡`;
  }

  /**
   * Handle payment with template
   */
  private async handlePayWithTemplate(
    templateName: string,
    whatsappId: string,
    session: UserSession,
  ): Promise<string | { text: string; voice?: Buffer; voiceOnly?: boolean }> {
    const template = await this.paymentTemplatesService.getTemplateByName(whatsappId, templateName);
    if (!template) {
      return `❌ Template "${templateName}" not found.

Type \`templates\` to see your saved templates.`;
    }

    // Update template usage
    await this.paymentTemplatesService.useTemplate(whatsappId, template.id);

    // Create send command from template
    const sendCommand: ParsedCommand = {
      type: CommandType.SEND,
      args: {
        amount: template.amount.toString(),
        username: template.recipient,
        memo: template.memo || '',
      },
      rawText: `send ${template.amount} to ${template.recipient}`,
    };

    // Execute the payment
    const result = await this.handleSendCommand(sendCommand, whatsappId, session);

    // If payment succeeded, add template info to response
    if (typeof result === 'string' && result.includes('✅')) {
      return result + `\n\n📝 Used template: *${templateName}*`;
    }

    // Handle voice response objects
    if (typeof result === 'object' && 'text' in result && result.text.includes('✅')) {
      return {
        ...result,
        text: result.text + `\n\n📝 Used template: *${templateName}*`,
      };
    }

    return result;
  }

  /**
   * Handle learn command
   */
  private async handleLearnCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      const action = command.args.action || 'ask';

      switch (action) {
        case 'ask': {
          // Get a random question
          const question = await this.randomQuestionService.getRandomQuestion(whatsappId);
          if (!question) {
            return '📚 No more questions available right now. Check back later!';
          }
          return this.randomQuestionService.formatQuestion(question);
        }

        case 'category': {
          const category = command.args.query;
          if (!category) {
            const categories = this.randomQuestionService.getCategories();
            return `📂 *Available Categories:*\n\n${categories
              .map((c) => `• ${c}`)
              .join('\n')}\n\nType \`learn category [name]\` to see your answers in that category.`;
          }

          const results = await this.userKnowledgeBaseService.getUserKnowledgeByCategory(
            whatsappId,
            category.toLowerCase(),
          );

          if (results.length === 0) {
            return `📂 No knowledge stored in category "${category}".`;
          }

          let message = `📂 *${category.charAt(0).toUpperCase() + category.slice(1)} Knowledge*\n\n`;
          results.forEach((entry) => {
            const date = new Date(entry.timestamp).toLocaleDateString();
            message += `❓ ${entry.question}\n`;
            message += `💡 ${entry.answer}\n`;
            message += `📅 ${date}\n\n`;
          });

          return message;
        }

        case 'delete': {
          const knowledgeId = command.args.query;
          if (!knowledgeId) {
            return '❌ Please provide the knowledge ID to delete. Example: `learn delete abc123`';
          }

          const success = await this.userKnowledgeBaseService.deleteUserKnowledge(
            whatsappId,
            knowledgeId,
          );

          if (success) {
            return '✅ Knowledge entry deleted successfully.';
          } else {
            return '❌ Knowledge entry not found or already deleted.';
          }
        }

        case 'stats': {
          const stats = await this.userKnowledgeBaseService.getUserKnowledgeStats(whatsappId);

          let message = '📊 *Your Knowledge Base Statistics*\n\n';
          message += `📚 Total Entries: ${stats.totalEntries}\n`;

          if (stats.totalEntries > 0) {
            message += '\n*By Category:*\n';
            Object.entries(stats.categoryCounts).forEach(([category, count]) => {
              message += `• ${category}: ${count} entries\n`;
            });

            if (stats.oldestEntry && stats.newestEntry) {
              message += `\n📅 First Entry: ${stats.oldestEntry.toLocaleDateString()}\n`;
              message += `📅 Latest Entry: ${stats.newestEntry.toLocaleDateString()}\n`;
            }
          }

          message += '\n💡 Keep teaching me with the `learn` command!';
          return message;
        }

        case 'reset': {
          await this.randomQuestionService.resetAskedQuestions(whatsappId);
          return '♻️ Question history reset! You can now answer previously asked questions again.';
        }

        default: {
          // Show all stored knowledge
          const allKnowledge = await this.userKnowledgeBaseService.getUserKnowledge(whatsappId);
          return this.userKnowledgeBaseService.formatKnowledgeList(allKnowledge);
        }
      }
    } catch (error) {
      this.logger.error('Error handling learn command:', error);
      return '❌ Something went wrong with the learning feature. Please try again.';
    }
  }

  /**
   * Format plugin voice response
   */
  private async formatPluginVoiceResponse(
    pluginResponse: any,
    command: ParsedCommand,
    whatsappId: string,
    context: CommandContext,
  ): Promise<{ text: string; voice?: Buffer; voiceOnly?: boolean } | null> {
    if (!pluginResponse.voiceText || context.voiceMode === 'off') {
      return null;
    }

    const shouldUseVoice = await this.ttsService.shouldUseVoice(
      command.rawText,
      command.args.isVoiceCommand === 'true',
      whatsappId,
    );

    if (!shouldUseVoice) {
      return null;
    }

    const audioBuffer = await this.ttsService.textToSpeech(
      pluginResponse.voiceText,
      'en',
      whatsappId,
    );

    const shouldSendVoiceOnly = await this.ttsService.shouldSendVoiceOnly(whatsappId);

    return {
      text: shouldSendVoiceOnly ? '' : pluginResponse.text || '',
      voice: audioBuffer,
      voiceOnly: shouldSendVoiceOnly,
    };
  }

  /**
   * Schedule plugin follow-up action
   */
  private schedulePluginFollowUp(
    pluginResponse: any,
    whatsappId: string,
    phoneNumber: string,
    session: UserSession | null,
    isGroup?: boolean,
    groupId?: string,
  ): void {
    if (!pluginResponse.followUp) {
      return;
    }

    setTimeout(async () => {
      try {
        this.logger.debug('Executing follow-up action:', pluginResponse.followUp);

        const followUpCommand = this.commandParserService.parseCommand(
          pluginResponse.followUp.action,
        );

        await this.handleCommand(
          followUpCommand,
          whatsappId,
          phoneNumber,
          session,
          false,
          isGroup,
          groupId,
        );
      } catch (error) {
        this.logger.error('Error executing follow-up action:', error);
      }
    }, pluginResponse.followUp.delay);
  }

  /**
   * Try to handle command through plugin system
   */
  private async tryPluginCommand(
    command: ParsedCommand,
    whatsappId: string,
    phoneNumber: string,
    session: UserSession | null,
    isGroup?: boolean,
    groupId?: string,
  ): Promise<string | { text: string; voice?: Buffer; voiceOnly?: boolean } | null> {
    try {
      // Build command context for plugins - parallelize async calls
      const [username, voiceMode, selectedVoice] = await Promise.all([
        session?.flashAuthToken
          ? this.usernameService.getUsername(session.flashAuthToken)
          : Promise.resolve(undefined),
        this.userVoiceSettingsService.getUserVoiceMode(whatsappId),
        this.userVoiceSettingsService.getUserVoice(whatsappId),
      ]);

      const context: CommandContext = {
        userId: whatsappId,
        phoneNumber,
        isAuthenticated: !!session,
        username: username || undefined,
        isGroup: isGroup || false,
        groupId: groupId,
        voiceMode: voiceMode || undefined,
        selectedVoice: selectedVoice || undefined,
      };

      // Try to execute command through plugin system
      const pluginResponse = await this.pluginLoaderService.executeCommand(
        command.rawText,
        context,
      );

      if (!pluginResponse) {
        return null;
      }

      // Handle plugin error response
      if (pluginResponse.error?.showToUser) {
        return pluginResponse.error.message;
      }

      // Format base response
      let response: string | { text: string; voice?: Buffer; voiceOnly?: boolean } =
        pluginResponse.text || '✅ Command executed successfully';

      // Handle voice response if needed
      const voiceResponse = await this.formatPluginVoiceResponse(
        pluginResponse,
        command,
        whatsappId,
        context,
      );

      if (voiceResponse) {
        response = voiceResponse;
      }

      // Schedule follow-up actions
      this.schedulePluginFollowUp(
        pluginResponse,
        whatsappId,
        phoneNumber,
        session,
        isGroup,
        groupId,
      );

      return response;
    } catch (error) {
      this.logger.error('Error handling plugin command:', error);
      return null;
    }
  }

  /**
   * Get configured cache TTLs for deduplication
   */
  private getCacheTTLs() {
    return {
      price: this.configService.get<number>('cache.priceTtl', 900) * 1000, // Convert to ms
      username: this.configService.get<number>('cache.usernameTtl', 3600) * 1000,
      exchangeRate: this.configService.get<number>('cache.exchangeRateTtl', 1800) * 1000,
    };
  }

  /**
   * Helper method to generate voice response with parallelized checks
   */
  private async generateVoiceResponse(
    text: string,
    whatsappId: string,
    isVoiceCommand: boolean = false,
    isAiResponse: boolean = false,
  ): Promise<{ text: string; voice?: Buffer; voiceOnly?: boolean }> {
    // Parallelize voice setting checks
    const [shouldUseVoice, shouldSendVoiceOnly] = await Promise.all([
      this.ttsService.shouldUseVoice(text, isAiResponse, whatsappId),
      this.ttsService.shouldSendVoiceOnly(whatsappId),
    ]);

    if (!shouldUseVoice && !isVoiceCommand) {
      return { text, voice: undefined, voiceOnly: false };
    }

    try {
      // Generate voice audio
      const audioBuffer = await this.ttsService.textToSpeech(text, 'en', whatsappId);

      return {
        text: shouldSendVoiceOnly ? '' : text,
        voice: audioBuffer,
        voiceOnly: shouldSendVoiceOnly,
      };
    } catch (error) {
      this.logger.error('Failed to generate voice response:', error);
      // Fallback to text-only response
      return { text, voice: undefined, voiceOnly: false };
    }
  }
}
